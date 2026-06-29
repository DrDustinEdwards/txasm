import { useEffect, useRef } from "react";
import { Form, redirect, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/signin";
import { cloudflareContext } from "~/load-context";
import { getAuth, getSessionUser } from "~/lib/auth.server";

export function meta(_args: Route.MetaArgs) {
  return [{ title: "Sign in | Texas Branch ASM" }];
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
    await getAuth(env).api.signInMagicLink({
      body: { email, callbackURL: "/" },
      headers: request.headers,
    });
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
      <div className="mx-auto max-w-md space-y-4">
        <h1 ref={confirmRef} tabIndex={-1} className="text-2xl font-semibold">
          Check your inbox
        </h1>
        <p className="text-gray-700 dark:text-gray-300">
          A sign-in link is on its way. Open it to finish signing in. The link
          expires soon, so use it before it does.
        </p>
        {import.meta.env.DEV ? (
          <p className="rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
            Development note: email is not wired yet, so the link is printed to
            the Worker logs instead of sent. Read it from the dev server output or
            wrangler tail.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="text-gray-700 dark:text-gray-300">
          Enter your email and we will send a sign-in link. No password needed.
        </p>
      </div>

      <Form method="post" className="space-y-4" noValidate>
        <div className="space-y-1">
          <label htmlFor="email" className="block text-sm font-medium">
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
            className="w-full rounded border border-gray-300 px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-gray-700 dark:bg-gray-900"
          />
          {error ? (
            <p
              id="email-error"
              role="alert"
              className="text-sm text-red-700 dark:text-red-400"
            >
              {error}
            </p>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-blue-700 px-4 py-2 font-medium text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
        >
          {submitting ? "Sending..." : "Send sign-in link"}
        </button>
      </Form>
    </div>
  );
}
