import { useEffect, useState } from "react";
import { isAPIError } from "better-auth/api";
import { Form, redirect, useActionData, useFetcher, useNavigation, useRevalidator } from "react-router";
import { Link } from "capsomer/react/link";
import {
  FRESH_SECONDS,
  accountSessions,
  dismissPasskeyOffer,
  needsSecondPasskey,
  passkeyLastUsed,
  passkeyRows,
  revokeSessionById,
  securityHistory,
  shouldOfferPasskey,
} from "@dustinedwards/site-runtime/sign-in";
import { canOfferPasskey, signalPasskeys, signalUnknownCredential } from "@dustinedwards/site-runtime/sign-in-client";
import type { Route } from "./+types/account";
import { privateMeta } from "~/lib/site-meta";
import { cloudflareContext } from "~/load-context";
import { getAuth } from "~/lib/auth.server";
import { getDataAccess } from "~/lib/data-access";
import { authClient } from "~/lib/auth-client";
import { formatDateTime } from "~/lib/format";
import { readForm } from "~/lib/form.server";

// An app: passkeys and the account forms run in the browser. It hydrates (root.tsx, the `hydrate` handle).
export const handle = { hydrate: true };

export function meta({ matches }: Route.MetaArgs) {
  return privateMeta(matches, "Account");
}

// A security history row's kind (site-runtime securityHistory), in words; a sign-in says how.
const HISTORY_WORDS: Record<string, string> = {
  "passkey-added": "Passkey added",
  "passkey-removed": "Passkey removed",
  "sign-in-linked": "Sign-in method added",
  "sign-in-unlinked": "Sign-in method removed",
  "email-changed": "Email address changed",
  recovery: "Signed in by email with no passkey left",
};
const SIGN_IN_VIA: Record<string, string> = { link: "Signed in with an email link", code: "Signed in with an email code", passkey: "Signed in with a passkey" };
function historyWords(kind: string, via: string | null): string {
  if (kind === "sign-in") return (via && SIGN_IN_VIA[via]) || "Signed in";
  return HISTORY_WORDS[kind] ?? "Account change";
}

// A person's email address, passkeys, signed-in devices, recent security activity and the account itself. The email link and code land here
// with ?welcome=1: someone with no passkey who has not said "Not now" in 30 days is offered one, everyone else goes on home
// (site-runtime shouldOfferPasskey).
export async function loader({ request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const auth = await getAuth(env);
  const { headers } = request;
  // With the request, so this session's last use and place move with it (site-runtime sessionDetails), and
  // asResponse: false, or Better Auth answers with a Response and the page reads everyone as signed out.
  const current = await auth.api.getSession({ headers, request, asResponse: false });
  if (!current) throw redirect("/signin");
  const passkeys = await auth.api.listPasskeys({ headers });
  const welcome = new URL(request.url).searchParams.has("welcome");
  if (welcome && !(await shouldOfferPasskey(env.DB, current.user.id, passkeys))) throw redirect("/");
  const credentialIds = new Map(passkeys.map((p) => [p.id, p.credentialID]));
  // Named by the person, else by the password manager or device that holds it, with when each last signed the
  // person in (from auth_events, site-runtime passkeyLastUsed).
  const rows = welcome
    ? []
    : passkeyRows(passkeys, await passkeyLastUsed(env.DB, current.user.id)).map((p) => ({
        ...p,
        credentialId: credentialIds.get(p.id) ?? "",
      }));
  return {
    welcome,
    email: current.user.email,
    // Changing the email and deleting the account need a sign-in in the last FRESH_SECONDS (site-runtime ./sign-in).
    fresh: Date.now() - new Date(current.session.createdAt).getTime() < FRESH_SECONDS * 1000,
    deletionBlockers: welcome ? [] : await getDataAccess(env).account.deletionBlockers(current.user.id),
    // The relying party the passkeys belong to, for telling the password manager one is gone.
    rpId: new URL(env.BETTER_AUTH_URL).hostname,
    passkeys: rows,
    // One passkey: the page suggests a second on another device (site-runtime needsSecondPasskey). Decided here,
    // so the browser never loads site-runtime ./sign-in.
    secondPasskey: needsSecondPasskey(rows),
    // Null when the sign-in is too old to list them (site-runtime ./sign-in, FRESH_SECONDS).
    sessions: welcome ? [] : await accountSessions(auth, request),
    // The last ten sign-ins and changes to how the person signs in (auth_events, site-runtime ./sign-in).
    history: welcome ? [] : await securityHistory(env.DB, current.user.id, 10),
  };
}

// Signs another device out by its session id, so no session token reaches the page (site-runtime ./sign-in),
// records a "Not now" on the passkey offer, or deletes the account.
export async function action({ request, context }: Route.ActionArgs) {
  const { env } = context.get(cloudflareContext);
  const auth = await getAuth(env);
  const form = await readForm(request, 4 * 1024);
  if (form.get("intent") === "delete") return deleteAccount(auth, request);
  if (form.get("intent") === "not-now") {
    const current = await auth.api.getSession({ headers: request.headers });
    if (current) await dismissPasskeyOffer(env.DB, current.user.id, { request });
    throw redirect("/");
  }
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
// account that holds a Meeting role (ACCOUNT_HAS_ROLE). Meeting records stay. Deleted, the browser's cookies are
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
  if (code === "ACCOUNT_HAS_ROLE") return { deleteError: "Your account holds a role in a Meeting, so it was not deleted." };
  return { deleteError: "The account was not deleted. Try again." };
}

export default function Account({ loaderData }: Route.ComponentProps) {
  const { welcome, email, fresh, deletionBlockers, rpId, passkeys, secondPasskey, sessions, history } = loaderData;
  const revalidator = useRevalidator();
  const signOut = useFetcher<typeof action>();
  const deleted = useActionData<typeof action>();
  const deleting = useNavigation().formData?.get("intent") === "delete";
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [emailNote, setEmailNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  // The offer shows only where this device can make a passkey (a platform authenticator); null until the browser says.
  const [offerable, setOfferable] = useState<boolean | null>(null);
  useEffect(() => {
    if (!welcome) return;
    void canOfferPasskey().then((can) => {
      if (can) setOfferable(true);
      else window.location.replace("/");
    });
  }, [welcome]);
  // Each time the passkey list loads, the password manager hears which passkeys the site still accepts and
  // the address they belong to (the WebAuthn Signal API, where the browser has it).
  const credentialKey = passkeys.map((p) => p.credentialId).join(" ");
  useEffect(() => {
    if (welcome) return;
    void signalPasskeys({ rpId, credentialIds: credentialKey ? credentialKey.split(" ") : [], name: email });
  }, [welcome, rpId, credentialKey, email]);

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
    // The sign-in got older than FRESH_SECONDS while the page was open: sign in again, then come back.
    if (result?.error && "code" in result.error && result.error.code === "SESSION_NOT_FRESH") {
      window.location.assign("/signin?next=/account");
      return;
    }
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
    // Removing a passkey needs a sign-in in the last FRESH_SECONDS, as adding one does.
    if (result?.error && "code" in result.error && result.error.code === "SESSION_NOT_FRESH") {
      window.location.assign("/signin?next=/account");
      return;
    }
    if (result?.error) {
      setError("The passkey was not removed. Try again.");
      return;
    }
    // So the password manager stops offering it (the WebAuthn Signal API, where the browser has it).
    await signalUnknownCredential({ rpId, credentialId });
    void revalidator.revalidate();
  }

  // Renaming needs no fresh sign-in (Better Auth's updatePasskey).
  async function renamePasskey(id: string, form: HTMLFormElement) {
    const name = String(new FormData(form).get("name") ?? "").trim();
    if (!name) return;
    const result = await authClient.passkey.updatePasskey({ id, name });
    if (result?.error) {
      setError("The passkey was not renamed. Try again.");
      return;
    }
    setRenaming(null);
    void revalidator.revalidate();
  }

  async function signOutOtherDevices() {
    const result = await authClient.revokeOtherSessions();
    if (result?.error) setError("The other devices were not signed out. Try again.");
    else void revalidator.revalidate();
  }

  const addButton = (
    <button type="button" className="cap-btn" data-variant="primary" disabled={busy} onClick={() => void addPasskey()}>
      {busy ? "Waiting for your device..." : passkeys.length > 0 ? "Add another passkey" : "Create a passkey"}
    </button>
  );

  if (welcome) {
    return (
      <div className="narrow stack-6">
        <div className="stack-2">
          <h1 className="page-title">You are signed in</h1>
          {offerable ? (
            <p>
              Next time, skip the email. A passkey signs you in with your face, fingerprint or device PIN, and only
              works on this site, so it cannot be phished.
            </p>
          ) : null}
        </div>
        {error ? (
          <p role="alert" className="cap-field-error">
            {error}
          </p>
        ) : null}
        {offerable ? (
          <Form method="post" className="cluster">
            {addButton}
            <button type="submit" name="intent" value="not-now" className="cap-btn" data-variant="quiet">
              Not now
            </button>
          </Form>
        ) : null}
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
          confirm it from the new one. Your other devices are then signed out.
        </p>
      </div>
      {!fresh ? (
        <p>
          <Link to="/signin?next=/account">Sign in again to change your email</Link>
        </p>
      ) : (
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
      )}
      <div className="stack-2">
        <h2 className="subsection-title">Passkeys</h2>
        <p>A passkey signs you in with your face, fingerprint or device PIN. Without one, sign in with an email link.</p>
      </div>
      {passkeys.length === 0 ? (
        <p className="cap-muted">No passkeys yet.</p>
      ) : (
        <ul className="stack-3" aria-label="Your passkeys">
          {passkeys.map((p) =>
            renaming === p.id ? (
              <li key={p.id}>
                <form
                  className="cluster"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void renamePasskey(p.id, event.currentTarget);
                  }}
                >
                  <label htmlFor={`name-${p.id}`} className="cap-sr-only">
                    New name for {p.name}
                  </label>
                  <input id={`name-${p.id}`} name="name" defaultValue={p.name} maxLength={60} required className="cap-input" />
                  <button type="submit" className="cap-btn">
                    Save
                  </button>
                  <button type="button" className="cap-btn" data-variant="quiet" onClick={() => setRenaming(null)}>
                    Cancel
                  </button>
                </form>
              </li>
            ) : (
              <li key={p.id} className="cluster">
                <span>
                  {p.name}
                  <span className="small cap-muted">
                    {p.provider !== p.name ? ` (${p.provider})` : ""}
                    {p.createdAt ? `, added ${formatDateTime(new Date(p.createdAt))}` : ""}
                    {`, ${p.lastUsedAt ? `last used ${formatDateTime(new Date(p.lastUsedAt))}` : "not used to sign in yet"}`}
                  </span>
                </span>
                <button
                  type="button"
                  className="cap-btn"
                  data-variant="quiet"
                  aria-label={`Rename passkey ${p.name}`}
                  onClick={() => setRenaming(p.id)}
                >
                  Rename
                </button>
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
            ),
          )}
        </ul>
      )}
      {secondPasskey ? (
        <p>
          You have one passkey. Add another on a second device, such as your phone or a security key, so you can still
          sign in if you lose this one.
        </p>
      ) : null}
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
        <h2 className="subsection-title">Recent security activity</h2>
        <p>Your last sign-ins and changes to how you sign in. If you do not recognize one, sign out of that device.</p>
      </div>
      {history.length === 0 ? (
        <p className="cap-muted">Nothing yet.</p>
      ) : (
        <ul className="stack-3" aria-label="Your recent security activity">
          {history.map((h, i) => (
            <li key={`${new Date(h.at).getTime()}-${i}`}>
              {historyWords(h.kind, h.via)}
              <span className="small cap-muted">
                {` ${formatDateTime(new Date(h.at))}`}
                {h.device ? `, ${h.device}` : ""}
                {h.location ? ` near ${h.location}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="stack-2">
        <h2 className="subsection-title">Delete your account</h2>
        {deletionBlockers.length > 0 ? (
          <p>
            Your account holds a role in a Meeting (admin, chair or reviewer). <Link to="/contact">Contact the branch</Link>{" "}
            to hand it over, then you can delete your account here.
          </p>
        ) : (
          <p>
            This deletes your account, its passkeys and its signed-in devices, and removes your email and name from it.
            It cannot be undone. Your abstracts, reviews and registrations stay in the Meeting archive, with author
            names as you submitted them, no longer connected to an account. You can make a new account later with any
            email address.
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
