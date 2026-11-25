import { Stack } from "capsomer/react/stack";
import { Title } from "capsomer/react/text";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { safeAdminNext } from "@dustinedwards/site-runtime/access";
import { mountTurnstile } from "@dustinedwards/site-runtime/turnstile";
import { Form, data, redirect, useActionData, useNavigation } from "react-router";
import { Banner } from "capsomer/react/banner";
import type { Route } from "./+types/login";
import { pageTitle } from "~/lib/site-meta";
import { privateMeta } from "@drdustinedwards/site-helpers/head";
import { cloudflareContext } from "@dustinedwards/site-runtime/context";
import { SIGN_IN_EXPIRES_IN_WORDS, signInMethods } from "@dustinedwards/site-runtime/sign-in";
import { signInFormAction } from "@dustinedwards/site-runtime/sign-in-form";
import { getAuth, getSessionUser } from "~/lib/auth.server";
import { authClient, signalAfterPasskeySignIn } from "~/lib/auth-client.client";
import { signInWithPasskey as passkeySignIn } from "@dustinedwards/site-runtime/sign-in-client";
import { SIGN_IN_PATH } from "@dustinedwards/site-runtime/sign-in-path";
import { readForm } from "@dustinedwards/site-runtime/body";
import { FORM_LIMIT } from "~/lib/form.server";

export const handle = { hydrate: true };

export function meta({ matches }: Route.MetaArgs) {
  return privateMeta(pageTitle(matches, "Sign in"));
}

// `next` is the page to return to after signing in again: adding a passkey needs a sign-in from
// the last 10 minutes (site-runtime ./sign-in, FRESH_SECONDS). Only /account pages qualify.
function nextPath(next: unknown): string | null {
  return typeof next === "string" && next
    ? safeAdminNext(next, { prefix: "/account", path: SIGN_IN_PATH })
    : null;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const next = nextPath(new URL(request.url).searchParams.get("next"));
  const user = await getSessionUser(request);
  if (user && !next) throw redirect("/");
  const deleted = new URL(request.url).searchParams.has("deleted");
  return {
    turnstileSiteKey: signInMethods(context.get(cloudflareContext).env).turnstileSiteKey,
    next,
    deleted,
  };
}

// The whole action is site-runtime's (./sign-in-form): the code, the link, the limiter, the captcha check and the
// words. A signed-in code redirects; the page otherwise shows the state and status it answers with. The mail's cookie
// ties its code to this browser, so a sent answer carries its headers.
export async function action({ request, context }: Route.ActionArgs) {
  const { env } = context.get(cloudflareContext);
  const result = await signInFormAction(
    await getAuth(env),
    request,
    await readForm(request, FORM_LIMIT),
    // The link and the code land on /account, which offers a passkey to someone who has none and sends everyone else
    // on home; or back on the page that asked for a new sign-in.
    { landing: (next) => next, next: { fallback: "/account?welcome=1", within: ["/account"] } },
  );
  if ("location" in result) throw redirect(result.location, { headers: result.headers });
  return data(result.state, { status: result.status, headers: result.headers });
}

export default function SignIn({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";

  const inputRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLHeadingElement>(null);
  const turnstileRef = useRef<HTMLDivElement>(null);
  const { turnstileSiteKey: siteKey, next, deleted } = loaderData;

  const sent = actionData?.sent ?? null;
  const error = actionData?.error ?? null;
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
      <div className="cap-column cap-stack" data-width="narrow">
        <Title as="h1" ref={confirmRef} tabIndex={-1} size={2}>
          Check your inbox
        </Title>
        <p>Open the link, or enter the code. Expires in {SIGN_IN_EXPIRES_IN_WORDS}.</p>
        <Stack as={Form} method="post" noValidate>
          <input type="hidden" name="intent" value="code" />
          {next ? <input type="hidden" name="next" value={next} /> : null}
          <input type="hidden" name="email" value={sent} />
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
              aria-invalid={actionData?.codeError ? true : undefined}
              aria-describedby={actionData?.codeError ? "code-error" : undefined}
              className="cap-input"
            />
            {actionData?.codeError ? (
              <p id="code-error" role="alert" className="cap-field-error">
                {actionData?.codeError}
              </p>
            ) : null}
          </div>
          <button type="submit" disabled={submitting} className="cap-btn" data-variant="primary">
            {submitting ? "Signing in..." : "Sign in with the code"}
          </button>
        </Stack>
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
    <div className="cap-column cap-stack" data-width="narrow" data-gap="6">
      {deleted ? <p role="status">Your account was deleted.</p> : null}
      <Stack gap={3}>
        <Title as="h1" size={2}>
          {next ? "Sign in again" : "Sign in"}
        </Title>
        {next ? (
          <p>
            To change your passkeys, email or signed-in devices, or to delete your account, sign in
            again.
          </p>
        ) : null}
      </Stack>

      <Stack gap={3}>
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
      </Stack>

      <p className="cap-muted">Or get a link by email</p>

      <Stack as={Form} method="post" noValidate>
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
      </Stack>
    </div>
  );
}
