import { Form, Link, redirect, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/submit.$slug";
import { cloudflareContext } from "~/load-context";
import { requireUser } from "~/lib/auth.server";
import {
  DeadlinePassedError,
  NotFoundError,
  ValidationError,
  getActor,
  getDataAccess,
} from "~/lib/data-access";
import { formatDateTime } from "~/lib/format";

export function meta(_args: Route.MetaArgs) {
  return [{ title: "Submit an abstract | Texas Branch ASM" }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const { env } = context.get(cloudflareContext);
  const actor = await getActor(env, user.id);
  const da = getDataAccess(env);

  let edition;
  try {
    edition = await da.editions.get(params.slug);
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw new Response("Not found", { status: 404 });
    }
    throw error;
  }

  const now = Date.now();
  const notYet =
    !!edition.submissionOpensAt && now < edition.submissionOpensAt.getTime();
  const closed =
    !!edition.submissionDeadline && now > edition.submissionDeadline.getTime();
  const open = !notYet && !closed;

  const mine = await da.abstracts.listMine(actor, edition.id);

  return {
    edition: {
      slug: edition.slug,
      name: edition.name,
      submissionOpensAt: edition.submissionOpensAt,
      submissionDeadline: edition.submissionDeadline,
    },
    open,
    notYet,
    closed,
    mine,
  };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const user = await requireUser(request);
  const { env } = context.get(cloudflareContext);
  const actor = await getActor(env, user.id);
  const da = getDataAccess(env);

  let edition;
  try {
    edition = await da.editions.get(params.slug);
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw new Response("Not found", { status: 404 });
    }
    throw error;
  }

  try {
    const created = await da.abstracts.create(actor, {
      editionId: edition.id,
      title: "",
    });
    return redirect(`/abstracts/${created.id}/edit`);
  } catch (error) {
    if (error instanceof ValidationError || error instanceof DeadlinePassedError) {
      return { error: error.message };
    }
    throw error;
  }
}

function titleCase(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function SubmitStart({ loaderData }: Route.ComponentProps) {
  const { edition, open, notYet, closed, mine } = loaderData;
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";
  const error = actionData?.error ?? null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Submit an abstract</h1>
        <p className="text-gray-700 dark:text-gray-300">{edition.name}</p>
        {edition.submissionDeadline ? (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Submission deadline: {formatDateTime(edition.submissionDeadline)}
          </p>
        ) : null}
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        >
          {error}
        </p>
      ) : null}

      {notYet ? (
        <p className="rounded border border-gray-200 bg-gray-50 p-3 text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
          Submission is not open yet for this meeting
          {edition.submissionOpensAt
            ? `. It opens ${formatDateTime(edition.submissionOpensAt)}.`
            : "."}
        </p>
      ) : null}

      {closed ? (
        <p className="rounded border border-gray-200 bg-gray-50 p-3 text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
          The submission deadline has passed. New abstracts can no longer be
          started for this meeting.
        </p>
      ) : null}

      {mine.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-lg font-medium">Your abstracts for this meeting</h2>
          <ul className="divide-y divide-gray-100 dark:divide-gray-900">
            {mine.map((abstract) => (
              <li
                key={abstract.id}
                className="flex items-center justify-between gap-4 py-2"
              >
                <span>
                  {abstract.title ? (
                    <span dangerouslySetInnerHTML={{ __html: abstract.title }} />
                  ) : (
                    <span className="text-gray-500">Untitled</span>
                  )}{" "}
                  <span className="text-sm text-gray-500">
                    ({titleCase(abstract.status)})
                  </span>
                </span>
                <Link
                  to={`/abstracts/${abstract.id}/edit`}
                  className="font-medium text-blue-700 hover:underline dark:text-blue-400"
                >
                  Continue
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {open ? (
        <Form method="post">
          <button
            type="submit"
            disabled={submitting}
            className="rounded bg-blue-700 px-4 py-2 font-medium text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
          >
            {submitting ? "Starting..." : "Start a new abstract"}
          </button>
        </Form>
      ) : null}
    </div>
  );
}
