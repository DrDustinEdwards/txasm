import { SIGN_IN_LINK_WORDS, confirmSignInLink, signInLinkProblem } from "@dustinedwards/site-runtime/sign-in";
import { Link } from "capsomer/react/link";
import { data } from "react-router";
import type { Route } from "./+types/signin.confirm";
import { privateMeta } from "~/lib/site-meta";
import { cloudflareContext } from "~/load-context";
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
  return { problem: signInLinkProblem(request.url, { signedIn: failed && (await getSessionUser(request)) !== null }) };
}

export async function action({ request, context }: Route.ActionArgs) {
  const { env } = context.get(cloudflareContext);
  const response = await confirmSignInLink(await getAuth(env), request);
  // Better Auth's redirect (signed in, or back here with ?error=), or its per-IP limit.
  if (response.status !== 429) return response;
  return data({ limited: true }, { status: 429 });
}

export default function SignInConfirm({ loaderData, actionData }: Route.ComponentProps) {
  const { problem } = loaderData;

  if (problem) {
    const words = SIGN_IN_LINK_WORDS[problem];
    return (
      <div className="narrow stack-6">
        <div className="stack-2">
          <h1 className="page-title">{words.title}</h1>
          <p>{words.text}</p>
        </div>
        <div>
          {problem === "signed-in" ? (
            <Link to="/" className="cap-btn" data-variant="primary">
              Continue
            </Link>
          ) : (
            <Link to="/signin" className="cap-btn" data-variant="primary">
              Get a new link
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="narrow stack-6">
      <h1 className="page-title">Sign in to TXASM</h1>
      {/* A plain form: it posts to this URL, token and all, and the browser follows the redirect. */}
      <form method="post" className="stack-4">
        {actionData?.limited ? (
          <p role="alert" className="cap-field-error">
            Too many tries. Wait a minute, then try again.
          </p>
        ) : null}
        <div>
          <button type="submit" className="cap-btn" data-variant="primary">
            Sign in
          </button>
        </div>
      </form>
    </div>
  );
}
