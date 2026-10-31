import { Link } from "capsomer/react/link";
import { confirmEmailLink, emailLinkResult, type EmailLinkProblem } from "@dustinedwards/site-runtime/sign-in";
import { signalCurrentUserDetails } from "@dustinedwards/site-runtime/sign-in-client";
import { useEffect } from "react";
import { data } from "react-router";
import type { Route } from "./+types/account.email";
import { privateMeta } from "~/lib/site-meta";
import { cloudflareContext } from "~/load-context";
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

const PROBLEM_WORDS: Record<EmailLinkProblem, { title: string; text: string }> = {
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
  invalid: {
    title: "This link no longer works",
    text: "It was used already, or it was changed when it was copied. Ask for the change again from your account page.",
  },
  missing: {
    title: "This link is not complete",
    text: "It may have been cut short when it was copied. Open it straight from the email, or ask for the change again from your account page.",
  },
  failed: {
    title: "That change did not finish",
    text: "Something went wrong on our side. Ask for the change again from your account page.",
  },
};

export default function EmailChangeConfirm({ loaderData, actionData }: Route.ComponentProps) {
  const { done, problem, email } = loaderData;

  // The change is made: the password manager shows the new address on this account's passkeys.
  useEffect(() => {
    if (email) void signalCurrentUserDetails({ name: email });
  }, [email]);

  if (done) {
    return (
      <div className="narrow stack-6">
        <div className="stack-2">
          <h1 className="page-title">{done === "approved" ? "Change approved" : "Your email address changed"}</h1>
          <p>
            {done === "approved"
              ? "Now open the email we sent to the new address and confirm it there. The change is made when you do."
              : "Sign-in links now go to the new address, and your other devices were signed out. A notice went to both addresses."}
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

  if (problem) {
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
      {/* A plain form: it posts to this URL, token and all, and the browser follows the redirect. */}
      <form method="post" className="stack-4">
        {actionData?.limited ? (
          <p role="alert" className="cap-field-error">
            Too many tries. Wait a minute, then try again.
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
