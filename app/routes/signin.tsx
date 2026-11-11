import { Form, data, redirect, useActionData, useNavigation } from "react-router";
import { Banner } from "capsomer/react/banner";
import { SignIn as SignInScreen } from "capsomer/react/sign-in";
import { cloudflareContext } from "@dustinedwards/site-runtime/context";
import { signInMethods } from "@dustinedwards/site-runtime/sign-in";
import { safeNextPath, signInFormAction } from "@dustinedwards/site-runtime/sign-in-form";
import { readForm } from "@dustinedwards/site-runtime/body";
import type { Route } from "./+types/signin";
import { privateMeta } from "~/lib/site-meta";
import { getAuth, getSessionUser } from "~/lib/auth.server";
import { authClient } from "~/lib/auth-client";
import { FORM_LIMIT } from "~/lib/form.server";

// The sign-in page: Capsomer's sign-in screen on site-runtime's signInFormAction. A passkey first, then an emailed
// link and code, Turnstile on the link; no Google or Apple. Passkeys and Turnstile run in the browser, so it hydrates
// (root.tsx, the `hydrate` handle).
export const handle = { hydrate: true };

export function meta({ matches }: Route.MetaArgs) {
  return privateMeta(matches, "Sign in");
}

// `next` is the page to return to after signing in again: a change to how the person signs in needs a sign-in from
// the last 10 minutes (site-runtime ./sign-in, FRESH_SECONDS). Only /account pages qualify; anything else is none.
const NEXT = { fallback: "", within: ["/account"] } as const;

export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const next = safeNextPath(url.searchParams.get("next"), NEXT);
  const user = await getSessionUser(request);
  if (user && !next) throw redirect("/");
  return {
    methods: signInMethods(context.get(cloudflareContext).env),
    next,
    // Set by /account after the person deleted their account.
    deleted: url.searchParams.has("deleted"),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const { env } = context.get(cloudflareContext);
  const result = await signInFormAction(
    await getAuth(env),
    request,
    await readForm(request, FORM_LIMIT),
    {
      // The link and the code land on /account, which offers a passkey to someone who has none and sends everyone
      // else on home; or back on the page that asked for a new sign-in.
      landing: (next) => next || "/account?welcome=1",
      next: NEXT,
    },
  );
  if ("location" in result) throw redirect(result.location, { headers: result.headers });
  return data(result.state, { status: result.status });
}

export default function SignIn({ loaderData }: Route.ComponentProps) {
  const { methods, next, deleted } = loaderData;
  const state = useActionData<typeof action>() ?? null;
  const pending = useNavigation().state === "submitting";
  return (
    <div className="narrow">
      <SignInScreen
        title={next ? "Sign in again" : "Sign in"}
        lede={
          next
            ? "To change your passkeys, email or signed-in devices, or to delete your account, sign in again."
            : "Use your passkey, or get a sign-in link by email. No password needed."
        }
        notice={deleted ? "Your account was deleted." : null}
        client={authClient}
        methods={methods}
        state={state}
        passkeyLanding={next || "/"}
        next={next || undefined}
        pending={pending}
        Form={Form}
        footer={
          import.meta.env.DEV && state?.sent ? (
            <Banner tone="neutral">
              Development note: mail is off until cutover (EMAIL_ENABLED and the send_email
              binding), so the link and code were not sent. The Worker log shows only the subject of
              the mail that would have gone, never the link or the code.
            </Banner>
          ) : null
        }
      />
    </div>
  );
}
