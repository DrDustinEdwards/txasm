import { useEffect, useRef, useState } from "react";
import { mountTurnstile } from "@dustinedwards/site-runtime/turnstile";
import { Form, redirect, useActionData, useNavigation } from "react-router";
import { Banner } from "capsomer/react/banner";
import type { Route } from "./+types/signin";
import { privateMeta } from "~/lib/site-meta";
import { cloudflareContext } from "~/load-context";
import { signInMethods } from "@dustinedwards/site-runtime/sign-in";
import { getAuth, getSessionUser } from "~/lib/auth.server";
import { authClient } from "~/lib/auth-client";

export function meta({ matches }: Route.MetaArgs) {
  return privateMeta(matches, "Sign in");
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await getSessionUser(request);
  if (user) throw redirect("/");
  return { turnstileSiteKey: signInMethods(context.get(cloudflareContext).env).turnstileSiteKey };
}

type ActionResult = { ok: true } | { ok: false; error: string };

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
  try {
    // Through Better Auth's HTTP handler, not auth.api: only the handler runs the
    // rate limiter, so a direct api call let the form skip it (Grok audit
    // 2026-10-21, TX-4).
    const headers = new Headers({ "Content-Type": "application/json" });
    for (const name of ["origin", "cf-connecting-ip", "user-agent"]) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    // The Turnstile widget's token, for the captcha plugin (app/lib/auth.server.ts).
    const captchaToken = String(formData.get("cf-turnstile-response") ?? "");
    if (captchaToken) headers.set("x-captcha-response", captchaToken);
    const response = await (await getAuth(env)).handler(
      new Request(new URL("/api/auth/sign-in/magic-link", request.url), {
        method: "POST",
        headers,
        // The link lands on /account, which offers a passkey to someone who has none
        // and sends everyone else on home.
        body: JSON.stringify({ email, callbackURL: "/account?welcome=1" }),
      }),
    );
    if (response.status === 429) {
      return {
        ok: false,
        error: "Too many sign-in requests. Wait a minute and try again.",
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
    return { ok: true };
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
  const siteKey = loaderData.turnstileSiteKey;

  const sent = actionData?.ok === true;
  const error = actionData && !actionData.ok ? actionData.error : null;
  const [passkeyError, setPasskeyError] = useState<string | null>(null);

  // A passkey sign-in sets the session cookie, so a full load reads it.
  async function signInWithPasskey(autoFill: boolean) {
    const result = await authClient.signIn.passkey({ autoFill });
    if (!result?.error) {
      window.location.assign("/");
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
          A sign-in link is on its way. Open it to finish signing in. The link
          expires soon, so use it before it does.
        </p>
        {import.meta.env.DEV ? (
          <Banner tone="neutral">
            Development note: email is not wired yet, so the link is printed to
            the Worker logs instead of sent. Read it from the dev server output or
            wrangler tail.
          </Banner>
        ) : null}
      </div>
    );
  }

  return (
    <div className="narrow stack-6">
      <div className="stack-2">
        <h1 className="page-title">Sign in</h1>
        <p>Use your passkey, or get a sign-in link by email. No password needed.</p>
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
        <div className="cap-field">
          <label htmlFor="email" className="cap-field-label">
            Email
          </label>
          <input
            ref={inputRef}
            id="email"
            name="email"
            type="email"
            autoComplete="email webauthn"
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
          {submitting ? "Sending..." : "Send sign-in link"}
        </button>
      </Form>
    </div>
  );
}
