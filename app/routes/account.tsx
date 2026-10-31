import { useState } from "react";
import { isAPIError } from "better-auth/api";
import { redirect, useRevalidator } from "react-router";
import { Link } from "capsomer/react/link";
import { passkeyLabel, sessionRows } from "@dustinedwards/site-runtime/sign-in";
import { signalUnknownCredential } from "@dustinedwards/site-runtime/sign-in-client";
import type { Route } from "./+types/account";
import { privateMeta } from "~/lib/site-meta";
import { cloudflareContext } from "~/load-context";
import { getAuth } from "~/lib/auth.server";
import { authClient } from "~/lib/auth-client";
import { formatDateTime } from "~/lib/format";

export function meta({ matches }: Route.MetaArgs) {
  return privateMeta(matches, "Account");
}

// A person's passkeys and signed-in devices. The email link lands here with ?welcome=1:
// someone with no passkey is offered one, everyone else goes on home.
export async function loader({ request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const auth = await getAuth(env);
  const { headers } = request;
  const current = await auth.api.getSession({ headers });
  if (!current) throw redirect("/signin");
  const passkeys = await auth.api.listPasskeys({ headers });
  const welcome = new URL(request.url).searchParams.has("welcome");
  if (welcome && passkeys.length > 0) throw redirect("/");
  return {
    welcome,
    // The relying party the passkeys belong to, for telling the password manager one is gone.
    rpId: new URL(env.BETTER_AUTH_URL).hostname,
    // Named by the person, else by the password manager or device that holds it.
    passkeys: passkeys.map((p) => ({
      id: p.id,
      credentialId: p.credentialID,
      name: passkeyLabel(p),
      createdAt: p.createdAt,
    })),
    // Null when the sign-in is too old to list them (site-runtime ./sign-in, FRESH_SECONDS).
    sessions: welcome ? [] : await signedInDevices(auth, headers, current.session.token),
  };
}

async function signedInDevices(auth: Awaited<ReturnType<typeof getAuth>>, headers: Headers, token: string) {
  try {
    return sessionRows(await auth.api.listSessions({ headers }), token);
  } catch (error) {
    if (isAPIError(error) && error.body?.code === "SESSION_NOT_FRESH") return null;
    throw error;
  }
}

export default function Account({ loaderData }: Route.ComponentProps) {
  const { welcome, rpId, passkeys, sessions } = loaderData;
  const revalidator = useRevalidator();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function addPasskey() {
    setBusy(true);
    setError(null);
    const result = await authClient.passkey.addPasskey();
    // A sign-in older than 10 minutes cannot add a passkey (site-runtime ./sign-in, FRESH_SECONDS):
    // sign in again, then come back here.
    if (result?.error && "code" in result.error && result.error.code === "SESSION_NOT_FRESH") {
      window.location.assign("/signin?next=/account");
      return;
    }
    setBusy(false);
    if (result?.error) {
      setError("The passkey was not saved. Try again.");
      return;
    }
    if (welcome) window.location.assign("/");
    else void revalidator.revalidate();
  }

  async function removePasskey(id: string, credentialId: string) {
    const result = await authClient.passkey.deletePasskey({ id });
    if (result?.error) {
      setError("The passkey was not removed. Try again.");
      return;
    }
    // So the password manager stops offering it (the WebAuthn Signal API, where the browser has it).
    await signalUnknownCredential({ rpId, credentialId });
    void revalidator.revalidate();
  }

  async function signOutDevice(token: string) {
    const result = await authClient.revokeSession({ token });
    if (result?.error) setError("That device was not signed out. Try again.");
    else void revalidator.revalidate();
  }

  async function signOutOtherDevices() {
    const result = await authClient.revokeOtherSessions();
    if (result?.error) setError("The other devices were not signed out. Try again.");
    else void revalidator.revalidate();
  }

  const addButton = (
    <button type="button" className="cap-btn" data-variant="primary" disabled={busy} onClick={() => void addPasskey()}>
      {busy ? "Waiting for your device..." : "Create a passkey"}
    </button>
  );

  if (welcome) {
    return (
      <div className="narrow stack-6">
        <div className="stack-2">
          <h1 className="page-title">You are signed in</h1>
          <p>
            Next time, skip the email. A passkey signs you in with your face, fingerprint or device PIN, and only
            works on this site, so it cannot be phished.
          </p>
        </div>
        {error ? (
          <p role="alert" className="cap-field-error">
            {error}
          </p>
        ) : null}
        <div className="cluster">
          {addButton}
          <Link to="/">Not now</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="narrow stack-6">
      <h1 className="page-title">Account</h1>
      <div className="stack-2">
        <h2 className="subsection-title">Passkeys</h2>
        <p>A passkey signs you in with your face, fingerprint or device PIN. Without one, sign in with an email link.</p>
      </div>
      {passkeys.length === 0 ? (
        <p className="cap-muted">No passkeys yet.</p>
      ) : (
        <ul className="stack-3" aria-label="Your passkeys">
          {passkeys.map((p) => (
            <li key={p.id} className="cluster">
              <span>
                {p.name}
                {p.createdAt ? <span className="small cap-muted"> added {formatDateTime(new Date(p.createdAt))}</span> : null}
              </span>
              <button
                type="button"
                className="cap-btn"
                data-variant="quiet"
                aria-label={`Remove passkey ${p.name}`}
                onClick={() => void removePasskey(p.id, p.credentialId)}
              >
                Remove passkey
              </button>
            </li>
          ))}
        </ul>
      )}
      <div>{addButton}</div>
      <div className="stack-2">
        <h2 className="subsection-title">Signed-in devices</h2>
        <p>Where you are signed in. Sign out of a device you do not know, or one you no longer use.</p>
      </div>
      {sessions === null ? (
        <p>
          <Link to="/signin?next=/account">Sign in again to see your devices</Link>
        </p>
      ) : (
        <>
          <ul className="stack-3" aria-label="Your signed-in devices">
            {sessions.map((s) => (
              <li key={s.id} className="cluster">
                <span>
                  {s.device ?? "Unknown device"}
                  <span className="small cap-muted">
                    {s.current
                      ? " (this device)"
                      : ` signed in ${formatDateTime(new Date(s.signedInAt))}, last active ${formatDateTime(new Date(s.lastActiveAt))}`}
                  </span>
                </span>
                {s.current ? null : (
                  <button
                    type="button"
                    className="cap-btn"
                    data-variant="quiet"
                    aria-label={`Sign out ${s.device ?? "Unknown device"}, signed in ${formatDateTime(new Date(s.signedInAt))}`}
                    onClick={() => void signOutDevice(s.token)}
                  >
                    Sign out
                  </button>
                )}
              </li>
            ))}
          </ul>
          {sessions.length > 1 ? (
            <div>
              <button type="button" className="cap-btn" onClick={() => void signOutOtherDevices()}>
                Sign out of all other devices
              </button>
            </div>
          ) : null}
        </>
      )}
      {error ? (
        <p role="alert" className="cap-field-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
