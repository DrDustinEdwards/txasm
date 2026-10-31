import {
  SIGN_IN_EXPIRES_IN_SECONDS,
  SIGN_IN_EXPIRES_IN_WORDS,
  confirmSignInLink,
} from "@dustinedwards/site-runtime/sign-in";
import { Link } from "capsomer/react/link";
import { data } from "react-router";
import type { Route } from "./+types/signin.confirm";
import { privateMeta } from "~/lib/site-meta";
import { cloudflareContext } from "~/load-context";
import { getAuth, getSessionUser } from "~/lib/auth.server";

// Where the emailed sign-in link opens (site-runtime ./sign-in, confirmPath). Its GET only shows
// this page, so a mail scanner that opens every link spends nothing; the button's POST signs in
// through confirmSignInLink. A spent or expired link comes back here with ?error=, and with
// ?sent=, the time the link was asked for (app/routes/signin.tsx): Better Auth answers
// INVALID_TOKEN for a used link and an expired one alike, so the time tells them apart.

export function meta({ matches }: Route.MetaArgs) {
  return privateMeta(matches, "Sign in");
}

// The page's URL holds the token.
export const headers = () => ({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex" });

type LinkProblem = "signed-in" | "expired" | "used" | "spent" | "failed" | "broken";

export async function loader({ request }: Route.LoaderArgs) {
  const params = new URL(request.url).searchParams;
  const error = params.get("error");
  let problem: LinkProblem | null = null;
  if (error) {
    const sent = Number(params.get("sent"));
    if (await getSessionUser(request)) problem = "signed-in";
    else if (error !== "INVALID_TOKEN") problem = "failed";
    else if (!Number.isFinite(sent) || sent <= 0) problem = "spent";
    else problem = Date.now() - sent > SIGN_IN_EXPIRES_IN_SECONDS * 1000 ? "expired" : "used";
  } else if (!params.get("token")) {
    problem = "broken";
  }
  return { problem };
}

// What went wrong, and what to do next.
const PROBLEMS: Record<LinkProblem, { title: string; text: string }> = {
  "signed-in": {
    title: "You are already signed in",
    text: "This link was used already, and this browser is signed in. There is nothing more to do.",
  },
  expired: {
    title: "This link has expired",
    text: `A sign-in link works for ${SIGN_IN_EXPIRES_IN_WORDS}. Send yourself a new one.`,
  },
  used: {
    title: "This link was already used",
    text: "A sign-in link works once. If you opened it in another browser or on another device, you are signed in there. To sign in here, send yourself a new link.",
  },
  spent: {
    title: "This link no longer works",
    text: `A sign-in link works once, for ${SIGN_IN_EXPIRES_IN_WORDS}. Send yourself a new one.`,
  },
  failed: {
    title: "That sign-in did not finish",
    text: "Something went wrong on our side. Send yourself a new link and try again.",
  },
  broken: {
    title: "This link is not complete",
    text: "It may have been cut short when it was copied. Open it straight from the email, or send yourself a new one.",
  },
};

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
    const words = PROBLEMS[problem];
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
