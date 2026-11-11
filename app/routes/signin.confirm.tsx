import { confirmSignInLink, signInLinkProblem } from "@dustinedwards/site-runtime/sign-in";
import { SignInConfirm as ConfirmScreen } from "capsomer/react/sign-in";
import { data } from "react-router";
import type { Route } from "./+types/signin.confirm";
import { privateMeta } from "~/lib/site-meta";
import { cloudflareContext } from "@dustinedwards/site-runtime/context";
import { getAuth, getSessionUser } from "~/lib/auth.server";

// Where the emailed sign-in link opens (site-runtime ./sign-in, confirmPath). Its GET only shows
// this page, so a mail scanner that opens every link spends nothing; the button's POST signs in
// through confirmSignInLink. A spent or expired link comes back here with ?error= and ?sent=, the
// time it was mailed, which site-runtime's signInLinkProblem reads to say used or expired.

// Part of sign-in, which hydrates as one flow (root.tsx, the `hydrate` handle).
export const handle = { hydrate: true };

export function meta({ matches }: Route.MetaArgs) {
  return privateMeta(matches, "Sign in");
}

// The page's URL holds the token.
export const headers = () => ({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex" });

export async function loader({ request }: Route.LoaderArgs) {
  // Whether this browser is signed in matters only once the link has failed.
  const failed = new URL(request.url).searchParams.has("error");
  return {
    problem: signInLinkProblem(request.url, {
      signedIn: failed && (await getSessionUser(request)) !== null,
    }),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const { env } = context.get(cloudflareContext);
  const response = await confirmSignInLink(await getAuth(env), request);
  // Better Auth's redirect (signed in, or back here with ?error=), or its per-IP limit.
  if (response.status !== 429) return response;
  return data({ limited: true }, { status: 429 });
}

export default function SignInConfirm({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <ConfirmScreen
      siteName="TXASM"
      problem={loaderData.problem}
      limited={actionData?.limited}
      signInPath="/signin"
      continuePath="/"
    />
  );
}
