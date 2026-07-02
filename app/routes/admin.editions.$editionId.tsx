import { Form, Link, redirect, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/admin.editions.$editionId";
import { cloudflareContext } from "~/load-context";
import { requireAdmin } from "~/lib/auth.server";
import {
  NotFoundError,
  ValidationError,
  getDataAccess,
  type EditionPatch,
} from "~/lib/data-access";
import { EDITION_STATUSES, type EditionStatus } from "~/lib/editions";
import { toDateTimeLocal } from "~/lib/format";

export function meta(_args: Route.MetaArgs) {
  return [{ title: "Edit meeting | Texas Branch ASM" }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { actor } = await requireAdmin(request);
  const { env } = context.get(cloudflareContext);
  const edition = await getDataAccess(env).editions.getById(
    actor,
    params.editionId,
  );
  return { edition };
}

function parseDate(value: FormDataEntryValue | null): Date | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError("Enter a valid date and time.");
  }
  return date;
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const { actor } = await requireAdmin(request);
  const form = await request.formData();
  const status = String(form.get("status") ?? "");

  if (!EDITION_STATUSES.includes(status as EditionStatus)) {
    return { error: "Choose a valid status." };
  }

  try {
    const patch: EditionPatch = {
      status: status as EditionStatus,
      registrationOpensAt: parseDate(form.get("registrationOpensAt")),
      registrationClosesAt: parseDate(form.get("registrationClosesAt")),
      submissionOpensAt: parseDate(form.get("submissionOpensAt")),
      submissionDeadline: parseDate(form.get("submissionDeadline")),
    };
    const { env } = context.get(cloudflareContext);
    await getDataAccess(env).editions.update(actor, params.editionId, patch);
  } catch (error) {
    if (error instanceof ValidationError || error instanceof NotFoundError) {
      return { error: error.message };
    }
    throw error;
  }

  return redirect("/admin");
}

function titleCase(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const inputClass =
  "w-full rounded border border-gray-300 px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-gray-700 dark:bg-gray-900";

export default function EditEdition({ loaderData }: Route.ComponentProps) {
  const { edition } = loaderData;
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";
  const error = actionData?.error ?? null;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">{edition.name}</h1>
        <p className="text-gray-700 dark:text-gray-300">
          {titleCase(edition.season)} {edition.year}.{" "}
          <Link
            to={`/admin/editions/${edition.id}/categories`}
            className="font-medium text-blue-700 hover:underline dark:text-blue-400"
          >
            Registration categories
          </Link>{" "}
          <span aria-hidden="true">|</span>{" "}
          <Link
            to={`/admin/editions/${edition.id}/abstract-categories`}
            className="font-medium text-blue-700 hover:underline dark:text-blue-400"
          >
            Abstract categories
          </Link>{" "}
          <span aria-hidden="true">|</span>{" "}
          <Link
            to={`/admin/editions/${edition.id}/roles`}
            className="font-medium text-blue-700 hover:underline dark:text-blue-400"
          >
            Chairs and reviewers
          </Link>{" "}
          <span aria-hidden="true">|</span>{" "}
          <Link
            to={`/admin/editions/${edition.id}/review`}
            className="font-medium text-blue-700 hover:underline dark:text-blue-400"
          >
            Assign reviewers
          </Link>{" "}
          <span aria-hidden="true">|</span>{" "}
          <Link
            to={`/admin/editions/${edition.id}/decisions`}
            className="font-medium text-blue-700 hover:underline dark:text-blue-400"
          >
            Decisions
          </Link>{" "}
          <span aria-hidden="true">|</span>{" "}
          <a
            href={`/admin/editions/${edition.id}/book/preview`}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-blue-700 hover:underline dark:text-blue-400"
          >
            Preview abstract book
          </a>{" "}
          <span aria-hidden="true">|</span>{" "}
          <Link
            to={`/admin/editions/${edition.id}/program`}
            className="font-medium text-blue-700 hover:underline dark:text-blue-400"
          >
            Program
          </Link>
        </p>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        >
          {error}
        </p>
      ) : null}

      <Form method="post" className="space-y-4" noValidate>
        <div className="space-y-1">
          <label htmlFor="status" className="block text-sm font-medium">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={edition.status}
            className={inputClass}
          >
            {EDITION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {titleCase(status)}
              </option>
            ))}
          </select>
        </div>

        <fieldset className="space-y-4 rounded border border-gray-200 p-4 dark:border-gray-800">
          <legend className="px-1 text-sm font-medium">Registration window</legend>
          <div className="space-y-1">
            <label
              htmlFor="registrationOpensAt"
              className="block text-sm font-medium"
            >
              Opens
            </label>
            <input
              id="registrationOpensAt"
              name="registrationOpensAt"
              type="datetime-local"
              defaultValue={toDateTimeLocal(edition.registrationOpensAt)}
              className={inputClass}
            />
          </div>
          <div className="space-y-1">
            <label
              htmlFor="registrationClosesAt"
              className="block text-sm font-medium"
            >
              Deadline
            </label>
            <input
              id="registrationClosesAt"
              name="registrationClosesAt"
              type="datetime-local"
              defaultValue={toDateTimeLocal(edition.registrationClosesAt)}
              className={inputClass}
            />
          </div>
        </fieldset>

        <fieldset className="space-y-4 rounded border border-gray-200 p-4 dark:border-gray-800">
          <legend className="px-1 text-sm font-medium">Submission window</legend>
          <div className="space-y-1">
            <label
              htmlFor="submissionOpensAt"
              className="block text-sm font-medium"
            >
              Opens
            </label>
            <input
              id="submissionOpensAt"
              name="submissionOpensAt"
              type="datetime-local"
              defaultValue={toDateTimeLocal(edition.submissionOpensAt)}
              className={inputClass}
            />
          </div>
          <div className="space-y-1">
            <label
              htmlFor="submissionDeadline"
              className="block text-sm font-medium"
            >
              Deadline
            </label>
            <input
              id="submissionDeadline"
              name="submissionDeadline"
              type="datetime-local"
              defaultValue={toDateTimeLocal(edition.submissionDeadline)}
              className={inputClass}
            />
          </div>
        </fieldset>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="rounded bg-blue-700 px-4 py-2 font-medium text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
          >
            {submitting ? "Saving..." : "Save changes"}
          </button>
          <Link
            to="/admin"
            className="text-sm font-medium text-gray-700 hover:underline dark:text-gray-300"
          >
            Cancel
          </Link>
        </div>
      </Form>
    </div>
  );
}
