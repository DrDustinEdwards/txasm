import { Form, Link, redirect, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/admin.editions.new";
import { pageTitle } from "~/lib/site-meta";
import { cloudflareContext } from "~/load-context";
import { requireAdmin } from "~/lib/auth.server";
import { AlreadyExistsError, ValidationError, getDataAccess } from "~/lib/data-access";
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
    <div className="form-page stack-6">
      <div className="stack-2">
        <h1 className="page-title">New meeting</h1>
        <p>Each meeting has a season and year, and the two together must be unique.</p>
      </div>

      {error ? (
        <p role="alert" className="cap-alert">
          {error}
        </p>
      ) : null}

      <Form method="post" className="stack-4" noValidate>
        <div className="stack-1">
          <label htmlFor="name" className="cap-field-label">
            Name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            placeholder="Spring 2027 Meeting"
            className="cap-input"
          />
        </div>

        <div className="stack-1">
          <label htmlFor="season" className="cap-field-label">
            Season
          </label>
          <select id="season" name="season" defaultValue="spring" className="cap-select">
            {SEASONS.map((season) => (
              <option key={season} value={season}>
                {SEASON_LABELS[season]}
              </option>
            ))}
          </select>
        </div>

        <div className="stack-1">
          <label htmlFor="year" className="cap-field-label">
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
            className="cap-input"
          />
        </div>

        <div className="stack-1">
          <label htmlFor="status" className="cap-field-label">
            Status
          </label>
          <select id="status" name="status" defaultValue="draft" className="cap-select">
            {EDITION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {EDITION_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>

        <div className="cluster">
          <button type="submit" disabled={submitting} className="cap-btn" data-variant="primary">
            {submitting ? "Creating..." : "Create meeting"}
          </button>
          <Link to="/admin" className="small strong cap-muted">
            Cancel
          </Link>
        </div>
      </Form>
    </div>
  );
}
