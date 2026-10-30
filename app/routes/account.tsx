import { useState } from "react";
import { getAuthenticatorName } from "@better-auth/passkey";
import { redirect, useRevalidator } from "react-router";
import { Link } from "capsomer/react/link";
import type { Route } from "./+types/account";
import { pageTitle } from "~/lib/site-meta";
import { cloudflareContext } from "~/load-context";
import { getAuth, requireUser } from "~/lib/auth.server";
import { authClient } from "~/lib/auth-client";
import { formatDateTime } from "~/lib/format";

export function meta({ matches }: Route.MetaArgs) {
  return [{ title: pageTitle(matches, "Passkeys") }];
}

// A person's passkeys. The email link lands here with ?welcome=1: someone with no
// passkey is offered one, everyone else goes on home.
export async function loader({ request, context }: Route.LoaderArgs) {
  await requireUser(request);
  const { env } = context.get(cloudflareContext);
  const passkeys = await (await getAuth(env)).api.listPasskeys({ headers: request.headers });
  const welcome = new URL(request.url).searchParams.has("welcome");
  if (welcome && passkeys.length > 0) throw redirect("/");
  return {
    welcome,
    // Named by the person, else by the password manager or device that holds it.
    passkeys: passkeys.map((p) => ({
      id: p.id,
      name: p.name || getAuthenticatorName(p.aaguid) || "Passkey",
      createdAt: p.createdAt,
    })),
  };
}

export default function Account({ loaderData }: Route.ComponentProps) {
  const { welcome, passkeys } = loaderData;
  const revalidator = useRevalidator();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function addPasskey() {
    setBusy(true);
    setError(null);
    const result = await authClient.passkey.addPasskey();
    setBusy(false);
    if (result?.error) {
      setError("The passkey was not saved. Try again.");
      return;
    }
    if (welcome) window.location.assign("/");
    else void revalidator.revalidate();
  }

  async function removePasskey(id: string) {
    const result = await authClient.passkey.deletePasskey({ id });
    if (result?.error) setError("The passkey was not removed. Try again.");
    else void revalidator.revalidate();
  }

  const addButton = (
    <button type="button" className="cap-btn" data-variant="primary" disabled={busy} onClick={() => void addPasskey()}>
      {busy ? "Waiting for your device..." : "Add a passkey"}
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
      <div className="stack-2">
        <h1 className="page-title">Passkeys</h1>
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
                aria-label={`Remove ${p.name}`}
                onClick={() => void removePasskey(p.id)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {error ? (
        <p role="alert" className="cap-field-error">
          {error}
        </p>
      ) : null}
      <div>{addButton}</div>
    </div>
  );
}
