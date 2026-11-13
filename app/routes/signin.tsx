import { useEffect, useEffectEvent, useRef, useState } from "react";
import { logEvent, requestFields } from "@dustinedwards/site-runtime/log";
import { safeAdminNext } from "@dustinedwards/site-runtime/access";
import { mountTurnstile } from "@dustinedwards/site-runtime/turnstile";
import { Form, redirect, useActionData, useNavigation } from "react-router";
import { Banner } from "capsomer/react/banner";
import type { Route } from "./+types/signin";
import { pageTitle } from "~/lib/site-meta";
import { privateMeta } from "@drdustinedwards/site-helpers/head";
import { cloudflareContext } from "@dustinedwards/site-runtime/context";
import { SIGN_IN_EXPIRES_IN_WORDS, signInMethods } from "@dustinedwards/site-runtime/sign-in";
import { signInWithCode, type CodeRefusal } from "@dustinedwards/site-runtime/sign-in-form";
import { getAuth, getSessionUser } from "~/lib/auth.server";
import { authClient, signalAfterPasskeySignIn } from "~/lib/auth-client";
import { signInWithPasskey as passkeySignIn } from "@dustinedwards/site-runtime/sign-in-client";
import { readForm } from "@dustinedwards/site-runtime/body";
import { FORM_LIMIT } from "~/lib/form.server";

// The sign-in form: passkeys, Turnstile and the email link run in the browser. It hydrates (root.tsx, the `hydrate` handle).
export const handle = { hydrate: true };

export function meta({ matches }: Route.MetaArgs) {
  return privateMeta(pageTitle(matches, "Sign in"));
}

// `next` is the page to return to after signing in again: adding a passkey needs a sign-in from
// the last 10 minutes (site-runtime ./sign-in, FRESH_SECONDS). Only /account pages qualify.
function nextPath(next: unknown): string | null {
  return typeof next === "string" && next
    ? safeAdminNext(next, { prefix: "/account", path: "/signin" })
    : null;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const next = nextPath(new URL(request.url).searchParams.get("next"));
  const user = await getSessionUser(request);
  if (user && !next) throw redirect("/");
  // Set by /account after the person deleted their account.
  const deleted = new URL(request.url).searchParams.has("deleted");
  return {
    turnstileSiteKey: signInMethods(context.get(cloudflareContext).env).turnstileSiteKey,
    next,
    deleted,
  };
}

type ActionResult = { ok: true; email: string; codeError?: string } | { ok: false; error: string };

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
// tab; the code signs in this one. site-runtime ./sign-in-form checks it through
// Better Auth's handler (its limiter runs) and logs a refusal; this maps the
// refusal to the page's words.
const CODE_REFUSALS: Record<CodeRefusal, string> = {
  limited: "Too many tries. Wait a minute, or use the link in the email.",
  "email-limited": "Too many tries. Try again later, or use the link in the email.",
  // The per-address code counter is down, so a typed code is refused; the link in the same mail still works.
  unavailable:
    "Codes can't be checked right now. Use the link in the email, or try again in a few minutes.",
  wrong: "That code is not right. Check the email and try again.",
  expired: `That code has expired: a code works for ${SIGN_IN_EXPIRES_IN_WORDS}. Send yourself a new one.`,
  spent:
    "That code was tried three times, so it no longer works. Use the link in the same email, or send a new one.",
  disposable: "That sign-in did not complete. Try again, or use the link in the email.",
  failed: "That sign-in did not complete. Try again, or use the link in the email.",
};

async function codeSignIn(
  env: Env,
  request: Request,
  email: string,
  code: string,
  landing: string,
): Promise<ActionResult> {
  const result = await signInWithCode(await getAuth(env), request, { email, code });
  if (result.status === "signed-in") throw redirect(landing, { headers: result.headers });
  return { ok: true, email, codeError: CODE_REFUSALS[result.status] };
}

export async function action({ request, context }: Route.ActionArgs): Promise<ActionResult> {
  const formData = await readForm(request, FORM_LIMIT);
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
    if (!/^\d{6}$/.test(code))
      return { ok: true, email, codeError: "Enter the six-digit code from the email." };
    return codeSignIn(env, request, email, code, landing);
  }
  try {
    // Through Better Auth's HTTP handler, not auth.api: only the handler runs the
    // rate limiter, so a direct api call let the form skip it (Grok audit
    // 2026-10-21, TX-4).
    const headers = forwardedHeaders(request);
    // The Turnstile widget's token, for the captcha plugin (app/lib/auth.server.ts).
    const captchaToken = String(formData.get("cf-turnstile-response") ?? "");
    if (captchaToken) headers.set("x-captcha-response", captchaToken);
    const response = await (
      await getAuth(env)
    ).handler(
      new Request(new URL("/api/auth/sign-in/magic-link", request.url), {
        method: "POST",
        headers,
        // A spent or expired link comes back to the confirm page, which says which from the time the
        // mailed link carries (site-runtime confirmLinkURL and signInLinkProblem).
        body: JSON.stringify({ email, callbackURL: landing }),
      }),
    );
    if (response.status === 429) {
      // Better Auth's per-IP limit, or the address's five mails an hour (EMAIL_RATE_LIMITED).
      const { code } = (await response
        .clone()
        .json()
        .catch(() => ({}))) as { code?: string };
      return {
        ok: false,
        error: `Too many sign-in requests. ${code === "EMAIL_RATE_LIMITED" ? "Try again later" : "Wait a minute and try again"}.`,
      };
    }
    // The captcha plugin's refusals: no token, or one Cloudflare would not pass.
    if (response.status === 400 || response.status === 403) {
      const { code } = (await response
        .clone()
        .json()
        .catch(() => ({}))) as { code?: string };
      if (code === "MISSING_RESPONSE" || code === "VERIFICATION_FAILED") {
        return { ok: false, error: "Complete the check, then send the link again." };
      }
    }
    // Turnstile's keys are missing and the site has not said to go on without them (app/lib/auth.server.ts).
    if (response.status === 503) {
      const { code } = (await response
        .clone()
        .json()
        .catch(() => ({}))) as { code?: string };
      if (code === "TURNSTILE_NOT_SET") {
        return {
          ok: false,
          error: "Sign-in links can't be sent right now. Use a passkey, or try again later.",
        };
      }
    }
    if (!response.ok) {
      throw new Error(`magic link request returned ${response.status}`);
    }
    return { ok: true, email };
  } catch (error) {
    logEvent("sign_in_link_failed", { ...requestFields(request), error }, { level: "error" });
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
  const { turnstileSiteKey: siteKey, next, deleted } = loaderData;

  const sent = actionData?.ok === true;
  const error = actionData && !actionData.ok ? actionData.error : null;
  const [passkeyError, setPasskeyError] = useState<string | null>(null);

  // A passkey sign-in sets the session cookie, so a full load reads it. False
  // when the passkey did not sign the person in.
  async function signInWithPasskey(autoFill: boolean): Promise<boolean> {
    // site-runtime's call tells the password manager when the site no longer knows the passkey.
    const result = await passkeySignIn(authClient, { autoFill });
    if (result?.error) return false;
    await signalAfterPasskeySignIn();
    window.location.assign(next ?? "/");
    return true;
  }

  async function signInWithPasskeyButton() {
    if (!(await signInWithPasskey(false))) {
      setPasskeyError("That passkey did not sign you in. Try again, or get a link by email.");
    }
  }

  // Where the browser can, it offers saved passkeys in the email field's
  // suggestions (autocomplete "webauthn"), so a returning person taps one. A
  // refused autofill says nothing. Once, on mount (an effect event, so it reads
  // the current `next`).
  const offerSavedPasskeys = useEffectEvent(async () => {
    if (await window.PublicKeyCredential?.isConditionalMediationAvailable?.()) {
      await signInWithPasskey(true);
    }
  });
  useEffect(() => {
    void offerSavedPasskeys();
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
      <div className="narrow cap-stack">
        <h1 ref={confirmRef} tabIndex={-1} className="page-title">
          Check your inbox
        </h1>
        <p>
          A sign-in link and code are on their way. Open the link, or type the code here. Both
          expire in {SIGN_IN_EXPIRES_IN_WORDS}.
        </p>
        <Form method="post" className="cap-stack" noValidate>
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
            Development note: mail is off until cutover (EMAIL_ENABLED and the send_email binding),
            so the link and code were not sent. The Worker log shows only the subject of the mail
            that would have gone, never the link or the code.
          </Banner>
        ) : null}
      </div>
    );
  }

  return (
    <div className="narrow cap-stack" data-gap="6">
      {deleted ? <p role="status">Your account was deleted.</p> : null}
      <div className="cap-stack" data-gap="3">
        <h1 className="page-title">{next ? "Sign in again" : "Sign in"}</h1>
        <p>
          {next
            ? "To change your passkeys, email or signed-in devices, or to delete your account, sign in again. "
            : null}
          Use your passkey, or get a sign-in link by email. No password needed.
        </p>
      </div>

      <div className="cap-stack" data-gap="3">
        <button
          type="button"
          className="cap-btn"
          data-variant="primary"
          onClick={() => void signInWithPasskeyButton()}
        >
          Sign in with a passkey
        </button>
        {passkeyError ? (
          <p role="alert" className="cap-field-error">
            {passkeyError}
          </p>
        ) : null}
      </div>

      <p className="cap-muted">Or get a link by email</p>

      <Form method="post" className="cap-stack" noValidate>
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
            // oxlint-disable-next-line jsx-a11y/autocomplete-valid -- "username webauthn" is valid HTML autofill: the webauthn token offers saved passkeys
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
