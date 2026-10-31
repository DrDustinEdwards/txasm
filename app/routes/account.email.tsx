import { Link } from "capsomer/react/link";
import { data, redirect, useSearchParams } from "react-router";
import type { Route } from "./+types/account.email";
import { privateMeta } from "~/lib/site-meta";
import { cloudflareContext } from "~/load-context";
import { getAuth } from "~/lib/auth.server";

// Where both links of an email change open (app/lib/auth.server.ts): the one to the current
// address, which approves the change and mails the new one, and the one to the new address, which
// makes it. The GET only shows a button, so a mail scanner that opens every link confirms nothing;
// the button's POST runs Better Auth's /verify-email through its handler, limiter and all.

export function meta({ matches }: Route.MetaArgs) {
  return privateMeta(matches, "Email change");
}

// The page's URL holds the token.
export const headers = () => ({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex" });

type Problem = "expired" | "done" | "other-account" | "broken" | "limited";

// Better Auth's refusals, in words. The old address no longer belonging to anyone means the
// change was already made, from this link or the other.
const PROBLEMS: Record<string, Problem> = {
  TOKEN_EXPIRED: "expired",
  USER_NOT_FOUND: "done",
  INVALID_USER: "other-account",
};

export async function action({ request, context }: Route.ActionArgs) {
  const { env } = context.get(cloudflareContext);
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!token) return data({ problem: "broken" as Problem }, { status: 400 });
  const verify = new URL("/api/auth/verify-email", request.url);
  verify.searchParams.set("token", token);
  const forwarded = new Headers(request.headers);
  forwarded.delete("content-type");
  forwarded.delete("content-length");
  const response = await (await getAuth(env)).handler(new Request(verify, { method: "GET", headers: forwarded }));
  if (response.status === 429) return data({ problem: "limited" as Problem }, { status: 429 });
  const body = (await response.json().catch(() => ({}))) as { code?: string; user?: unknown };
  if (!response.ok) return data({ problem: PROBLEMS[body.code ?? ""] ?? ("broken" as Problem) }, { status: 400 });
  // The second link answers with the user and, in a browser that was signed out, a new session.
  const cookies = new Headers();
  for (const cookie of response.headers.getSetCookie()) cookies.append("Set-Cookie", cookie);
  throw redirect(`${new URL(request.url).pathname}?done=${body.user ? "changed" : "approved"}`, { headers: cookies });
}

const PROBLEM_WORDS: Record<Problem, { title: string; text: string }> = {
  expired: {
    title: "This link has expired",
    text: "An email change link works for 1 hour. Sign in and ask for the change again from your account page.",
  },
  done: {
    title: "This change was already made",
    text: "Your account already uses the new address. Sign in with it.",
  },
  "other-account": {
    title: "This link is for another account",
    text: "This browser is signed in to a different TXASM account. Sign out, then open the link again.",
  },
  broken: {
    title: "This link does not work",
    text: "It may have been cut short when it was copied. Open it straight from the email, or ask for the change again from your account page.",
  },
  limited: {
    title: "Too many tries",
    text: "Wait a minute, then try again.",
  },
};

export default function EmailChangeConfirm({ actionData }: Route.ComponentProps) {
  const [params] = useSearchParams();
  const done = params.get("done");

  if (done === "approved" || done === "changed") {
    return (
      <div className="narrow stack-6">
        <div className="stack-2">
          <h1 className="page-title">{done === "changed" ? "Your email address changed" : "Change approved"}</h1>
          <p>
            {done === "changed"
              ? "Sign-in links now go to the new address. A notice went to both addresses."
              : "Now open the email we sent to the new address and confirm it there. The change is made when you do."}
          </p>
        </div>
        <div>
          <Link to="/account" className="cap-btn" data-variant="primary">
            Go to your account
          </Link>
        </div>
      </div>
    );
  }

  const problem = actionData?.problem ?? (params.get("token") ? null : "broken");
  if (problem && problem !== "limited") {
    const words = PROBLEM_WORDS[problem];
    return (
      <div className="narrow stack-6">
        <div className="stack-2">
          <h1 className="page-title">{words.title}</h1>
          <p>{words.text}</p>
        </div>
        <div>
          <Link to="/account" className="cap-btn" data-variant="primary">
            Go to your account
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="narrow stack-6">
      <div className="stack-2">
        <h1 className="page-title">Confirm the email change</h1>
        <p>This changes the email address your TXASM account signs in with.</p>
      </div>
      {/* A plain form: it posts to this URL, token and all. */}
      <form method="post" className="stack-4">
        {problem === "limited" ? (
          <p role="alert" className="cap-field-error">
            {PROBLEM_WORDS.limited.text}
          </p>
        ) : null}
        <div>
          <button type="submit" className="cap-btn" data-variant="primary">
            Confirm
          </button>
        </div>
      </form>
    </div>
  );
}
