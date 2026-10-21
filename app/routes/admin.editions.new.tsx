import { Form, Link, redirect, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/admin.editions.new";
import { pageTitle } from "~/lib/site-meta";
import { cloudflareContext } from "~/load-context";
import { requireAdmin } from "~/lib/auth.server";
import {
  AlreadyExistsError,
  ValidationError,
  getDataAccess,
} from "~/lib/data-access";
import {
  EDITION_STATUSES,
  EDITION_STATUS_LABELS,
  SEASONS,
  SEASON_LABELS,
  type EditionStatus,
  type Season,
} from "~/lib/vocab";

export function meta({ matches }: Route.MetaArgs) {
  return [{ title: pageTitle(matches, "New meeting") }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  return null;
}

export async function action({ request, context }: Route.ActionArgs) {
  const { actor } = await requireAdmin(request);

  const form = await request.formData();
  const name = String(form.get("name") ?? "").trim();
  const season = String(form.get("season") ?? "");
  const yearRaw = String(form.get("year") ?? "").trim();
  const status = String(form.get("status") ?? "draft");

  const year = Number(yearRaw);

  if (!name) return { error: "Name is required." };
  if (!(SEASONS as readonly string[]).includes(season)) {
    return { error: "Season must be spring or fall." };
  }
  if (!yearRaw || !Number.isInteger(year) || year < 2000 || year > 2100) {
    return { error: "Enter a four digit year between 2000 and 2100." };
  }
  if (!EDITION_STATUSES.includes(status as EditionStatus)) {
    return { error: "Choose a valid status." };
  }

  const { env } = context.get(cloudflareContext);
  try {
    await getDataAccess(env).editions.create(actor, {
      name,
      season: season as Season,
      year,
      status: status as EditionStatus,
    });
  } catch (error) {
    if (error instanceof ValidationError || error instanceof AlreadyExistsError) {
      return { error: error.message };
    }
    throw error;
  }

  return redirect("/admin");
}

export default function NewEdition() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";
  const error = actionData?.error ?? null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">New meeting</h1>
        <p className="text-gray-700 dark:text-gray-300">
          Each meeting has a season and year, and the two together must be unique.
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
          <label htmlFor="name" className="block text-sm font-medium">
            Name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            placeholder="Spring 2027 Meeting"
            className="w-full rounded border border-gray-300 px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-gray-700 dark:bg-gray-900"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="season" className="block text-sm font-medium">
            Season
          </label>
          <select
            id="season"
            name="season"
            defaultValue="spring"
            className="w-full rounded border border-gray-300 px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-gray-700 dark:bg-gray-900"
          >
            {SEASONS.map((season) => (
              <option key={season} value={season}>
                {SEASON_LABELS[season]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="year" className="block text-sm font-medium">
            Year
          </label>
          <input
            id="year"
            name="year"
            type="number"
            inputMode="numeric"
            min={2000}
            max={2100}
            required
            placeholder="2027"
            className="w-full rounded border border-gray-300 px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-gray-700 dark:bg-gray-900"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="status" className="block text-sm font-medium">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue="draft"
            className="w-full rounded border border-gray-300 px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-gray-700 dark:bg-gray-900"
          >
            {EDITION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {EDITION_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-primary px-4 py-2 font-medium text-on-primary hover:opacity-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-60"
          >
            {submitting ? "Creating..." : "Create meeting"}
          </button>
          <Link
            to="/admin"
            className="text-sm font-medium text-text-muted hover:underline"
          >
            Cancel
          </Link>
        </div>
      </Form>
    </div>
  );
}
