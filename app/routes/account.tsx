import { Form, data, redirect, useActionData, useNavigation, useRevalidator } from "react-router";
import { Link } from "capsomer/react/link";
import { AccountSettings, PasskeyOffer } from "capsomer/react/sign-in-settings";
import {
  accountSessions,
  dismissPasskeyOffer,
  passkeyLastUsed,
  passkeyRows,
  securityHistory,
  sessionIsFresh,
  sessionLookup,
  shouldOfferPasskey,
} from "@dustinedwards/site-runtime/sign-in";
import { accountFormAction, safeNextPath } from "@dustinedwards/site-runtime/sign-in-form";
import { readForm } from "@dustinedwards/site-runtime/body";
import { cloudflareContext } from "@dustinedwards/site-runtime/context";
import type { Route } from "./+types/account";
import { privateMeta } from "~/lib/site-meta";
import { getAuth } from "~/lib/auth.server";
import { getDataAccess } from "~/lib/data-access";
import { authClient } from "~/lib/auth-client";

// An app: passkeys and the account forms run in the browser. It hydrates (root.tsx, the `hydrate` handle).
export const handle = { hydrate: true };

export function meta({ matches }: Route.MetaArgs) {
  return privateMeta(matches, "Account");
}

// The fresh-sign-in link: the sign-in page asks for a new sign-in when it has a `next`, and comes back here.
const SIGN_IN_AGAIN = "/signin?next=/account";

// A person's email address, passkeys, signed-in devices, recent security activity and the account itself (Capsomer's
// account settings). The email link and code land here with ?welcome=1: someone with no passkey who has not said
// "Not now" in 30 days is offered one, everyone else goes on home (site-runtime shouldOfferPasskey).
export async function loader({ request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const auth = await getAuth(env);
  const { headers } = request;
  // site-runtime sessionLookup: with the request, so this session's last use and place move with it, and
  // asResponse: false, or Better Auth answers with a Response and the page reads everyone as signed out.
  const current = await auth.api.getSession(sessionLookup(request));
  if (!current) throw redirect("/signin");
  const passkeys = await auth.api.listPasskeys({ headers });
  if (new URL(request.url).searchParams.has("welcome")) {
    if (!(await shouldOfferPasskey(env.DB, current.user.id, passkeys))) throw redirect("/");
    return { welcome: true as const };
  }
  const credentialIds = new Map(passkeys.map((p) => [p.id, p.credentialID]));
  return {
    welcome: false as const,
    email: current.user.email,
    // Changing the email and deleting the account need a sign-in in the last FRESH_SECONDS (site-runtime ./sign-in).
    fresh: sessionIsFresh(current.session),
    // An admin, chair or reviewer grant is handed over before the account can go (app/lib/auth.server.ts).
    blocked: (await getDataAccess(env).account.deletionBlockers(current.user.id)).length > 0,
    // The relying party the passkeys belong to, for telling the password manager one is gone.
    rpId: new URL(env.BETTER_AUTH_URL).hostname,
    // Named by the person, else by the password manager or device that holds it, with when each last signed the
    // person in (from auth_events, site-runtime passkeyLastUsed).
    passkeys: passkeyRows(passkeys, await passkeyLastUsed(env.DB, current.user.id)).map((p) => ({
      ...p,
      credentialId: credentialIds.get(p.id) ?? null,
    })),
    // Null when the sign-in is too old to list them (site-runtime ./sign-in, FRESH_SECONDS).
    devices: await accountSessions(auth, request),
    // The last ten sign-ins and changes to how the person signs in (auth_events, site-runtime ./sign-in).
    history: await securityHistory(env.DB, current.user.id, 10),
  };
}

// The account page's posts (site-runtime accountFormAction): sign out a device by its session id, change the email,
// delete the account (its Meeting-role refusal and hand-over are auth.server.ts's beforeDelete). The passkey offer's
// "Not now" posts its `next` alone, recorded for 30 days.
export async function action({ request, context }: Route.ActionArgs) {
  const { env } = context.get(cloudflareContext);
  const auth = await getAuth(env);
  const form = await readForm(request, 4 * 1024);
  const result = await accountFormAction(auth, request, form, {
    deletedLanding: "/signin?deleted=1",
  });
  if (result) {
    if ("location" in result) throw redirect(result.location, { headers: result.headers });
    return data(result.state, { status: result.status });
  }
  if (form.has("next")) {
    const current = await auth.api.getSession(sessionLookup(request));
    if (current) await dismissPasskeyOffer(env.DB, current.user.id, { request });
    throw redirect(safeNextPath(form.get("next")));
  }
  return data(null, { status: 400 });
}

export default function Account({ loaderData }: Route.ComponentProps) {
  const state = useActionData<typeof action>() ?? null;
  const formData = useNavigation().formData;
  const revalidator = useRevalidator();

  if (loaderData.welcome) {
    return (
      <div className="narrow">
        <PasskeyOffer client={authClient} next="/" siteName="TXASM" Form={Form} />
      </div>
    );
  }

  const { email, fresh, blocked, rpId, passkeys, devices, history } = loaderData;
  const intent = formData?.get("intent");
  return (
    <div className="narrow stack-6">
      <h1 className="page-title">Account</h1>
      <AccountSettings
        email={email}
        client={authClient}
        passkeys={passkeys}
        providers={[]}
        devices={devices}
        history={history}
        fresh={fresh}
        state={state}
        pending={
          typeof intent === "string"
            ? { intent, session: String(formData?.get("session") ?? "") || null }
            : null
        }
        signalAs={{ name: email }}
        rpId={rpId}
        callbackURL="/account"
        signInAgainHref={SIGN_IN_AGAIN}
        revalidate={() => revalidator.revalidate()}
        deletion={{
          consequence:
            "This deletes your account, its passkeys and its signed-in devices, and removes your email and name from it. It cannot be undone. Your abstracts, reviews and registrations stay in the Meeting archive, with author names as you submitted them, no longer connected to an account. You can make a new account later with any email address.",
          blockers: blocked ? (
            <>
              Your account holds a role in a Meeting (admin, chair or reviewer).{" "}
              <Link to="/contact">Contact the branch</Link> to hand it over, then you can delete
              your account here.
            </>
          ) : undefined,
        }}
        Form={Form}
      />
    </div>
  );
}
