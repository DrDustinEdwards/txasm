import { useState } from "react";
import { isAPIError } from "better-auth/api";
import { Form, redirect, useActionData, useFetcher, useNavigation, useRevalidator } from "react-router";
import { Link } from "capsomer/react/link";
import { FRESH_SECONDS, accountSessions, passkeyLabel, revokeSessionById } from "@dustinedwards/site-runtime/sign-in";
import { signalUnknownCredential } from "@dustinedwards/site-runtime/sign-in-client";
import type { Route } from "./+types/account";
import { privateMeta } from "~/lib/site-meta";
import { cloudflareContext } from "~/load-context";
import { getAuth } from "~/lib/auth.server";
import { type AccountRecordKind, getDataAccess } from "~/lib/data-access";
import { authClient } from "~/lib/auth-client";
import { formatDateTime } from "~/lib/format";

export function meta({ matches }: Route.MetaArgs) {
  return privateMeta(matches, "Account");
}

// What an account holds that keeps it from being deleted here (data-access/account.ts), in words.
const RECORD_WORDS: Record<AccountRecordKind, string> = {
  role: "a role in a Meeting (admin, chair or reviewer)",
  registration: "a Meeting registration",
  abstract: "abstracts",
  review: "reviews",
  work: "work done for a Meeting",
};

// A person's email address, passkeys, signed-in devices and the account itself. The email link lands here with ?welcome=1:
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
    email: current.user.email,
    // Deleting the account needs a sign-in in the last FRESH_SECONDS (Better Auth's /delete-user).
    fresh: Date.now() - new Date(current.session.createdAt).getTime() < FRESH_SECONDS * 1000,
    deletionBlockers: welcome ? [] : await getDataAccess(env).account.deletionBlockers(current.user.id),
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
    sessions: welcome ? [] : await accountSessions(auth, request),
  };
}

// Signs another device out by its session id, so no session token reaches the page (site-runtime ./sign-in),
// or deletes the account.
export async function action({ request, context }: Route.ActionArgs) {
  const { env } = context.get(cloudflareContext);
  const auth = await getAuth(env);
  const form = await request.formData();
  if (form.get("intent") === "delete") return deleteAccount(auth, request);
  const id = String(form.get("session") ?? "");
  try {
    return { revoked: await revokeSessionById(auth, request, id) };
  } catch (error) {
    if (isAPIError(error) && error.body?.code === "SESSION_NOT_FRESH") return { revoked: false };
    throw error;
  }
}

// Through Better Auth's handler, for its limiter and origin check, as the sign-in form does. Better
// Auth refuses a sign-in older than FRESH_SECONDS (SESSION_EXPIRED), and app/lib/auth.server.ts an
// account that holds Meeting records (ACCOUNT_HAS_RECORDS). Deleted, the browser's cookies are
// cleared and the person lands on the sign-in page.
async function deleteAccount(auth: Awaited<ReturnType<typeof getAuth>>, request: Request) {
  const headers = new Headers({ "Content-Type": "application/json" });
  for (const name of ["cookie", "origin", "cf-connecting-ip", "user-agent"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const response = await auth.handler(
    new Request(new URL("/api/auth/delete-user", request.url), { method: "POST", headers, body: "{}" }),
  );
  if (response.ok) {
    const cleared = new Headers();
    for (const cookie of response.headers.getSetCookie()) cleared.append("Set-Cookie", cookie);
    throw redirect("/signin?deleted=1", { headers: cleared });
  }
  const { code } = (await response.json().catch(() => ({}))) as { code?: string };
  if (code === "SESSION_EXPIRED") return { deleteError: "Your sign-in is too old to delete the account. Sign in again, then try." };
  if (code === "ACCOUNT_HAS_RECORDS") return { deleteError: "Your account holds Meeting records, so it was not deleted." };
  return { deleteError: "The account was not deleted. Try again." };
}

export default function Account({ loaderData }: Route.ComponentProps) {
  const { welcome, email, fresh, deletionBlockers, rpId, passkeys, sessions } = loaderData;
  const revalidator = useRevalidator();
  const signOut = useFetcher<typeof action>();
  const deleted = useActionData<typeof action>();
  const deleting = useNavigation().formData?.get("intent") === "delete";
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [emailNote, setEmailNote] = useState<{ ok: boolean; text: string } | null>(null);

  // Better Auth mails the current address to approve, then the new one to confirm
  // (app/lib/auth.server.ts). An address already in use gets the same answer, so the
  // form never says whether someone has an account.
  async function changeEmail(form: HTMLFormElement) {
    const newEmail = String(new FormData(form).get("newEmail") ?? "").trim();
    setEmailNote(null);
    if (newEmail.toLowerCase() === email.toLowerCase()) {
      setEmailNote({ ok: false, text: "That is already your email address." });
      return;
    }
    const result = await authClient.changeEmail({ newEmail });
    if (result?.error) {
      setEmailNote({ ok: false, text: "The change was not started. Check the address and try again." });
      return;
    }
    form.reset();
    setEmailNote({
      ok: true,
      text: `We sent an email to ${email}. Approve the change there within an hour, then confirm it from ${newEmail}.`,
    });
  }

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
        <h2 className="subsection-title">Email address</h2>
        <p>
          Sign-in links go to <strong>{email}</strong>. To change it, approve the change from this address, then
          confirm it from the new one.
        </p>
      </div>
      <form
        className="stack-3"
        onSubmit={(event) => {
          event.preventDefault();
          void changeEmail(event.currentTarget);
        }}
      >
        <div className="cap-field">
          <label htmlFor="newEmail" className="cap-field-label">
            New email address
          </label>
          <input
            id="newEmail"
            name="newEmail"
            type="email"
            autoComplete="email"
            required
            aria-invalid={emailNote && !emailNote.ok ? true : undefined}
            aria-describedby={emailNote ? "email-note" : undefined}
            className="cap-input"
          />
          {emailNote ? (
            <p id="email-note" role={emailNote.ok ? "status" : "alert"} className={emailNote.ok ? undefined : "cap-field-error"}>
              {emailNote.text}
            </p>
          ) : null}
        </div>
        <div>
          <button type="submit" className="cap-btn">
            Change email
          </button>
        </div>
      </form>
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
                      : ` signed in ${formatDateTime(new Date(s.signedInAt))}, last active ${formatDateTime(new Date(s.lastActiveAt))}${s.location ? ` near ${s.location}` : ""}`}
                  </span>
                </span>
                {s.current ? null : (
                  <button
                    type="button"
                    className="cap-btn"
                    data-variant="quiet"
                    aria-label={`Sign out ${s.device ?? "Unknown device"}, signed in ${formatDateTime(new Date(s.signedInAt))}`}
                    onClick={() => void signOut.submit({ session: s.id }, { method: "post" })}
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
      {error || (signOut.data && "revoked" in signOut.data && !signOut.data.revoked) ? (
        <p role="alert" className="cap-field-error">
          {error ?? "That device was not signed out. Try again."}
        </p>
      ) : null}
      <div className="stack-2">
        <h2 className="subsection-title">Delete your account</h2>
        {deletionBlockers.length > 0 ? (
          <p>
            Your account holds {deletionBlockers.map((kind) => RECORD_WORDS[kind]).join(", ")}. These stay in the
            Meeting archive, so the account cannot be deleted here. <Link to="/contact">Contact the branch</Link> to
            ask about removing it.
          </p>
        ) : (
          <p>
            This deletes your account, its passkeys and its signed-in devices. It cannot be undone. You can make a new
            account later with any email address.
          </p>
        )}
      </div>
      {deletionBlockers.length > 0 ? null : !fresh ? (
        <p>
          <Link to="/signin?next=/account">Sign in again to delete your account</Link>
        </p>
      ) : (
        <Form method="post" className="stack-3">
          <input type="hidden" name="intent" value="delete" />
          <label className="cap-check">
            <input type="checkbox" name="confirm" required />I understand my account is deleted for good
          </label>
          {deleted && "deleteError" in deleted ? (
            <p role="alert" className="cap-field-error">
              {deleted.deleteError}
            </p>
          ) : null}
          <div>
            <button type="submit" className="cap-btn" data-variant="danger" disabled={deleting}>
              {deleting ? "Deleting..." : "Delete my account"}
            </button>
          </div>
        </Form>
      )}
    </div>
  );
}
