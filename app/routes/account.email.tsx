import { EmailConfirm } from "capsomer/react/sign-in";
import { confirmEmailLink, emailLinkResult } from "@dustinedwards/site-runtime/sign-in";
import { signalCurrentUserDetails } from "@dustinedwards/site-runtime/sign-in-passkey";
import { useEffect } from "react";
import { data } from "react-router";
import type { Route } from "./+types/account.email";
import { privateMeta } from "~/lib/site-meta";
import { cloudflareContext } from "@dustinedwards/site-runtime/context";
import { getAuth, getSessionUser } from "~/lib/auth.server";

// Where both links of an email change open (app/lib/auth.server.ts, site-runtime emailConfirmURL): the one
// to the current address, which approves the change and mails the new one, and the one to the new address,
// which makes it. The GET only shows a button, so a mail scanner that opens every link confirms nothing;
// the button's POST is site-runtime's confirmEmailLink, which runs Better Auth's /verify-email through its
// handler, limiter and all, and comes back here with ?done= or ?error= (emailLinkResult).

// Part of the account app, which hydrates: the browser tells the password manager the new address.
export const handle = { hydrate: true };

export function meta({ matches }: Route.MetaArgs) {
  return privateMeta(matches, "Email change");
}

// The page's URL holds the token.
export const headers = () => ({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex" });

export async function loader({ request }: Route.LoaderArgs) {
  const result = emailLinkResult(request.url);
  // After the change is made, the address the password manager should show for this account's passkeys.
  const email = result.done === "changed" ? ((await getSessionUser(request))?.email ?? null) : null;
  return { ...result, email };
}

export async function action({ request, context }: Route.ActionArgs) {
  const { env } = context.get(cloudflareContext);
  const response = await confirmEmailLink(await getAuth(env), request);
  // Better Auth's redirect back here (done or error), or its per-IP limit.
  if (response.status !== 429) return response;
  return data({ limited: true }, { status: 429 });
}

export default function EmailChangeConfirm({ loaderData, actionData }: Route.ComponentProps) {
  const { done, problem, email } = loaderData;

  // The change is made: the password manager shows the new address on this account's passkeys.
  useEffect(() => {
    if (email) void signalCurrentUserDetails({ name: email });
  }, [email]);

  return (
    <EmailConfirm
      siteName="TXASM"
      settings="your account"
      settingsPath="/account"
      done={done}
      problem={problem}
      email={email}
      limited={actionData?.limited}
    />
  );
}
