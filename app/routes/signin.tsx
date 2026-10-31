import { useEffect, useRef, useState } from "react";
import { safeAdminNext } from "@dustinedwards/site-runtime/access";
import { mountTurnstile } from "@dustinedwards/site-runtime/turnstile";
import { Form, redirect, useActionData, useNavigation } from "react-router";
import { Banner } from "capsomer/react/banner";
import type { Route } from "./+types/signin";
import { SIGN_IN_CONFIRM_PATH, privateMeta } from "~/lib/site-meta";
import { cloudflareContext } from "~/load-context";
import {
  SIGN_IN_CODE_PATH,
  SIGN_IN_EXPIRES_IN_WORDS,
  signInMethods,
} from "@dustinedwards/site-runtime/sign-in";
import { getAuth, getSessionUser } from "~/lib/auth.server";
import { authClient } from "~/lib/auth-client";

export function meta({ matches }: Route.MetaArgs) {
  return privateMeta(matches, "Sign in");
}

// `next` is the page to return to after signing in again: adding a passkey needs a sign-in from
// the last 10 minutes (site-runtime ./sign-in, FRESH_SECONDS). Only /account pages qualify.
function nextPath(next: unknown): string | null {
  return typeof next === "string" && next ? safeAdminNext(next, { prefix: "/account", path: "/signin" }) : null;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const next = nextPath(new URL(request.url).searchParams.get("next"));
  const user = await getSessionUser(request);
  if (user && !next) throw redirect("/");
  return { turnstileSiteKey: signInMethods(context.get(cloudflareContext).env).turnstileSiteKey, next };
}

type ActionResult =
  | { ok: true; email: string; codeError?: string }
  | { ok: false; error: string };

// The headers Better Auth's handler is handed: the origin it checks, the
// address its limiter counts and the user agent.
function forwardedHeaders(request: Request): Headers {
  const headers = new Headers({ "Content-Type": "application/json" });
  for (const name of ["origin", "cf-connecting-ip", "user-agent"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

// The six-digit code from the same mail, typed on the "Check your inbox" screen.
// The link signs in the browser that opens it, often the mail app's, not this
// tab; the code signs in this one (site-runtime ./sign-in). A wrong code counts,
// and after three it is spent while the link still works. Through the handler,
// for Better Auth's limiter, as the link request is.
async function signInWithCode(
  env: Env,
  request: Request,
  email: string,
  code: string,
  landing: string,
): Promise<ActionResult> {
  const answer = (codeError: string): ActionResult => ({ ok: true, email, codeError });
  try {
    const response = await (await getAuth(env)).handler(
      new Request(new URL(`/api/auth${SIGN_IN_CODE_PATH}`, request.url), {
        method: "POST",
        headers: forwardedHeaders(request),
        body: JSON.stringify({ email, otp: code }),
      }),
    );
    if (response.ok) {
      // Only the session cookies go on to the redirect.
      const headers = new Headers();
      for (const cookie of response.headers.getSetCookie()) headers.append("Set-Cookie", cookie);
      throw redirect(landing, { headers });
    }
    const { code: reason } = (await response.json().catch(() => ({}))) as { code?: string };
    // Better Auth's per-IP limit, or the address's ten codes a day (EMAIL_RATE_LIMITED).
    if (response.status === 429) {
      return answer(`Too many tries. ${reason === "EMAIL_RATE_LIMITED" ? "Try again later" : "Wait a minute"}, or use the link in the email.`);
    }
    if (reason === "INVALID_OTP") return answer("That code is not right. Check the email and try again.");
    if (reason === "OTP_EXPIRED" || reason === "TOO_MANY_ATTEMPTS") {
      return answer("That code has expired or was tried too many times. Use the link in the email, or send a new one.");
    }
    // The status only: the body can carry the address.
    console.error(`[signin] code sign-in returned ${response.status}`);
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[signin] code sign-in did not complete");
  }
  return answer("That sign-in did not complete. Try again, or use the link in the email.");
}

export async function action({
  request,
  context,
}: Route.ActionArgs): Promise<ActionResult> {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim();
  if (!email) {
    return { ok: false, error: "Enter your email address." };
  }

  const { env } = context.get(cloudflareContext);
  // The link and the code land on /account, which offers a passkey to someone who has none and
  // sends everyone else on home; or back on the page that asked for a new sign-in.
  const landing = nextPath(formData.get("next")) ?? "/account?welcome=1";
  const code = String(formData.get("code") ?? "").replace(/\s+/g, "");
  if (formData.get("intent") === "code") {
    if (!/^\d{6}$/.test(code)) return { ok: true, email, codeError: "Enter the six-digit code from the email." };
    return signInWithCode(env, request, email, code, landing);
  }
  try {
    // Through Better Auth's HTTP handler, not auth.api: only the handler runs the
    // rate limiter, so a direct api call let the form skip it (Grok audit
    // 2026-10-21, TX-4).
    const headers = forwardedHeaders(request);
    // The Turnstile widget's token, for the captcha plugin (app/lib/auth.server.ts).
    const captchaToken = String(formData.get("cf-turnstile-response") ?? "");
    if (captchaToken) headers.set("x-captcha-response", captchaToken);
    const response = await (await getAuth(env)).handler(
      new Request(new URL("/api/auth/sign-in/magic-link", request.url), {
        method: "POST",
        headers,
        // A spent or expired link comes back to the confirm page, which says so.
        body: JSON.stringify({ email, callbackURL: landing, errorCallbackURL: SIGN_IN_CONFIRM_PATH }),
      }),
    );
    if (response.status === 429) {
      // Better Auth's per-IP limit, or the address's five mails an hour (EMAIL_RATE_LIMITED).
      const { code } = (await response.clone().json().catch(() => ({}))) as { code?: string };
      return {
        ok: false,
        error: `Too many sign-in requests. ${code === "EMAIL_RATE_LIMITED" ? "Try again later" : "Wait a minute and try again"}.`,
      };
    }
    // The captcha plugin's refusals: no token, or one Cloudflare would not pass.
    if (response.status === 400 || response.status === 403) {
      const { code } = (await response.clone().json().catch(() => ({}))) as { code?: string };
      if (code === "MISSING_RESPONSE" || code === "VERIFICATION_FAILED") {
        return { ok: false, error: "Complete the check, then send the link again." };
      }
    }
    if (!response.ok) {
      throw new Error(`magic link request returned ${response.status}`);
    }
    return { ok: true, email };
  } catch (error) {
    console.error("[signin] magic link failed", error);
    return {
      ok: false,
      error: "We could not send the link. Check the address and try again.",
    };
  }
}

export default function SignIn({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";

  const inputRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLHeadingElement>(null);
  const turnstileRef = useRef<HTMLDivElement>(null);
  const { turnstileSiteKey: siteKey, next } = loaderData;

  const sent = actionData?.ok === true;
  const error = actionData && !actionData.ok ? actionData.error : null;
  const [passkeyError, setPasskeyError] = useState<string | null>(null);

  // A passkey sign-in sets the session cookie, so a full load reads it.
  async function signInWithPasskey(autoFill: boolean) {
    const result = await authClient.signIn.passkey({ autoFill });
    if (!result?.error) {
      window.location.assign(next ?? "/");
    } else if (!autoFill) {
      setPasskeyError("That passkey did not sign you in. Try again, or get a link by email.");
    }
  }

  // Where the browser can, it offers saved passkeys in the email field's
  // suggestions (autocomplete "webauthn"), so a returning person taps one.
  useEffect(() => {
    void (async () => {
      if (await window.PublicKeyCredential?.isConditionalMediationAvailable?.()) {
        await signInWithPasskey(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (sent) {
      confirmRef.current?.focus();
    } else {
      inputRef.current?.focus();
    }
  }, [actionData, sent]);

  // A token is good for one check, so after a refused send the widget is drawn
  // again for a fresh one.
  useEffect(() => {
    if (!siteKey || sent || !turnstileRef.current) return;
    return mountTurnstile(turnstileRef.current, siteKey);
  }, [siteKey, sent, actionData]);

  if (sent) {
    return (
      <div className="narrow stack-4">
        <h1 ref={confirmRef} tabIndex={-1} className="page-title">
          Check your inbox
        </h1>
        <p>
          A sign-in link and code are on their way. Open the link, or type the
          code here. Both expire in {SIGN_IN_EXPIRES_IN_WORDS}.
        </p>
        <Form method="post" className="stack-4" noValidate>
          <input type="hidden" name="intent" value="code" />
          {next ? <input type="hidden" name="next" value={next} /> : null}
          <input type="hidden" name="email" value={actionData.email} />
          <div className="cap-field">
            <label htmlFor="code" className="cap-field-label">
              Code
            </label>
            <input
              id="code"
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              required
              aria-invalid={actionData.codeError ? true : undefined}
              aria-describedby={actionData.codeError ? "code-error" : undefined}
              className="cap-input"
            />
            {actionData.codeError ? (
              <p id="code-error" role="alert" className="cap-field-error">
                {actionData.codeError}
              </p>
            ) : null}
          </div>
          <button type="submit" disabled={submitting} className="cap-btn" data-variant="primary">
            {submitting ? "Signing in..." : "Sign in with the code"}
          </button>
        </Form>
        {import.meta.env.DEV ? (
          <Banner tone="neutral">
            Development note: email is not wired yet, so the link and code are printed to
            the Worker logs instead of sent. Read them from the dev server output or
            wrangler tail.
          </Banner>
        ) : null}
      </div>
    );
  }

  return (
    <div className="narrow stack-6">
      <div className="stack-2">
        <h1 className="page-title">{next ? "Sign in again" : "Sign in"}</h1>
        <p>
          {next ? "To change your passkeys, sign in again. " : null}Use your passkey, or get a sign-in link by email. No
          password needed.
        </p>
      </div>

      <div className="stack-2">
        <button type="button" className="cap-btn" data-variant="primary" onClick={() => void signInWithPasskey(false)}>
          Sign in with a passkey
        </button>
        {passkeyError ? (
          <p role="alert" className="cap-field-error">
            {passkeyError}
          </p>
        ) : null}
      </div>

      <p className="cap-muted">Or get a link by email</p>

      <Form method="post" className="stack-4" noValidate>
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <div className="cap-field">
          <label htmlFor="email" className="cap-field-label">
            Email
          </label>
          <input
            ref={inputRef}
            id="email"
            name="email"
            type="email"
            autoComplete="username webauthn"
            required
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "email-error" : undefined}
            className="cap-input"
          />
          {error ? (
            <p id="email-error" role="alert" className="cap-field-error">
              {error}
            </p>
          ) : null}
        </div>

        {siteKey ? <div ref={turnstileRef} /> : null}

        <button type="submit" disabled={submitting} className="cap-btn" data-variant="secondary">
          {submitting ? "Sending..." : "Email me a sign-in link"}
        </button>
      </Form>
    </div>
  );
}
