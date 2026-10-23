import { useEffect, useRef } from "react";
import { Form, redirect, useActionData, useNavigation } from "react-router";
import { Banner } from "capsomer/react/banner";
import type { Route } from "./+types/signin";
import { pageTitle } from "~/lib/site-meta";
import { cloudflareContext } from "~/load-context";
import { getAuth, getSessionUser } from "~/lib/auth.server";

export function meta({ matches }: Route.MetaArgs) {
  return [{ title: pageTitle(matches, "Sign in") }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const user = await getSessionUser(request);
  if (user) throw redirect("/");
  return null;
}

type ActionResult = { ok: true } | { ok: false; error: string };

export async function action({
  request,
  context,
}: Route.ActionArgs): Promise<ActionResult> {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim();
  if (!email) {
    return { ok: false, error: "Enter your email address." };
  }

  const { env } = context.get(cloudflareContext);
  try {
    // Through Better Auth's HTTP handler, not auth.api: only the handler runs the
    // rate limiter, so a direct api call let the form skip it (Grok audit
    // 2026-10-21, TX-4).
    const headers = new Headers({ "Content-Type": "application/json" });
    for (const name of ["origin", "cf-connecting-ip", "user-agent"]) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    const response = await getAuth(env).handler(
      new Request(new URL("/api/auth/sign-in/magic-link", request.url), {
        method: "POST",
        headers,
        body: JSON.stringify({ email, callbackURL: "/" }),
      }),
    );
    if (response.status === 429) {
      return {
        ok: false,
        error: "Too many sign-in requests. Wait a minute and try again.",
      };
    }
    if (!response.ok) {
      throw new Error(`magic link request returned ${response.status}`);
    }
    return { ok: true };
  } catch (error) {
    console.error("[signin] magic link failed", error);
    return {
      ok: false,
      error: "We could not send the link. Check the address and try again.",
    };
  }
}

export default function SignIn() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";

  const inputRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLHeadingElement>(null);

  const sent = actionData?.ok === true;
  const error = actionData && !actionData.ok ? actionData.error : null;

  useEffect(() => {
    if (sent) {
      confirmRef.current?.focus();
    } else {
      inputRef.current?.focus();
    }
  }, [actionData, sent]);

  if (sent) {
    return (
      <div className="narrow stack-4">
        <h1 ref={confirmRef} tabIndex={-1} className="page-title">
          Check your inbox
        </h1>
        <p>
          A sign-in link is on its way. Open it to finish signing in. The link
          expires soon, so use it before it does.
        </p>
        {import.meta.env.DEV ? (
          <Banner tone="neutral">
            Development note: email is not wired yet, so the link is printed to
            the Worker logs instead of sent. Read it from the dev server output or
            wrangler tail.
          </Banner>
        ) : null}
      </div>
    );
  }

  return (
    <div className="narrow stack-6">
      <div className="stack-2">
        <h1 className="page-title">Sign in</h1>
        <p>Enter your email and we will send a sign-in link. No password needed.</p>
      </div>

      <Form method="post" className="stack-4" noValidate>
        <div className="cap-field">
          <label htmlFor="email" className="cap-field-label">
            Email
          </label>
          <input
            ref={inputRef}
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "email-error" : undefined}
            className="cap-input"
          />
          {error ? (
            <p id="email-error" role="alert" className="cap-field-error">
              {error}
            </p>
          ) : null}
        </div>

        <button type="submit" disabled={submitting} className="cap-btn" data-variant="primary">
          {submitting ? "Sending..." : "Send sign-in link"}
        </button>
      </Form>
    </div>
  );
}
