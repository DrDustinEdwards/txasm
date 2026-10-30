import { Form, Link, redirect, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/admin.editions.$editionId";
import { privateMeta } from "~/lib/site-meta";
import { cloudflareContext } from "~/load-context";
import { requireAdmin } from "~/lib/auth.server";
import {
  NotFoundError,
  ValidationError,
  getDataAccess,
  type EditionPatch,
} from "~/lib/data-access";
import {
  EDITION_STATUSES,
  EDITION_STATUS_LABELS,
  SEASON_LABELS,
  type EditionStatus,
  type Season,
} from "~/lib/vocab";
import { toDateTimeLocal } from "~/lib/format";

export function meta({ matches }: Route.MetaArgs) {
  return privateMeta(matches, "Edit meeting");
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { actor } = await requireAdmin(request);
  const { env } = context.get(cloudflareContext);
  const edition = await getDataAccess(env).editions.getById(actor, params.editionId);
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
      meetingStartsAt: parseDate(form.get("meetingStartsAt")),
      meetingEndsAt: parseDate(form.get("meetingEndsAt")),
      venueName: String(form.get("venueName") ?? ""),
      venueAddress: String(form.get("venueAddress") ?? ""),
      city: String(form.get("city") ?? ""),
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

export default function EditEdition({ loaderData }: Route.ComponentProps) {
  const { edition } = loaderData;
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";
  const error = actionData?.error ?? null;

  return (
    <div className="form-page stack-6">
      <div className="stack-2">
        <h1 className="page-title">{edition.name}</h1>
        <p>
          {SEASON_LABELS[edition.season as Season]} {edition.year}.{" "}
          <Link to={`/admin/editions/${edition.id}/categories`} className="strong">
            Registration categories
          </Link>{" "}
          <span aria-hidden="true">|</span>{" "}
          <Link to={`/admin/editions/${edition.id}/abstract-categories`} className="strong">
            Abstract categories
          </Link>{" "}
          <span aria-hidden="true">|</span>{" "}
          <Link to={`/admin/editions/${edition.id}/roles`} className="strong">
            Chairs and reviewers
          </Link>{" "}
          <span aria-hidden="true">|</span>{" "}
          <Link to={`/admin/editions/${edition.id}/review`} className="strong">
            Assign reviewers
          </Link>{" "}
          <span aria-hidden="true">|</span>{" "}
          <Link to={`/admin/editions/${edition.id}/decisions`} className="strong">
            Decisions
          </Link>{" "}
          <span aria-hidden="true">|</span>{" "}
          <Link to={`/admin/editions/${edition.id}/book`} className="strong">
            Abstract book
          </Link>{" "}
          <span aria-hidden="true">|</span>{" "}
          <Link to={`/admin/editions/${edition.id}/program`} className="strong">
            Program
          </Link>{" "}
          <span aria-hidden="true">|</span>{" "}
          <Link to={`/admin/editions/${edition.id}/speakers`} className="strong">
            Invited speakers
          </Link>{" "}
          <span aria-hidden="true">|</span>{" "}
          <Link to={`/admin/editions/${edition.id}/sponsors`} className="strong">
            Sponsors
          </Link>
        </p>
      </div>

      {error ? (
        <p role="alert" className="cap-alert">
          {error}
        </p>
      ) : null}

      <Form method="post" className="stack-4" noValidate>
        <div className="stack-1">
          <label htmlFor="status" className="cap-field-label">
            Status
          </label>
          <select id="status" name="status" defaultValue={edition.status} className="cap-select">
            {EDITION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {EDITION_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>

        <fieldset className="card stack-4">
          <legend className="legend">Meeting dates and venue</legend>
          <div className="stack-1">
            <label htmlFor="meetingStartsAt" className="cap-field-label">
              Starts
            </label>
            <input
              id="meetingStartsAt"
              name="meetingStartsAt"
              type="datetime-local"
              defaultValue={toDateTimeLocal(edition.meetingStartsAt)}
              className="cap-input"
            />
          </div>
          <div className="stack-1">
            <label htmlFor="meetingEndsAt" className="cap-field-label">
              Ends
            </label>
            <input
              id="meetingEndsAt"
              name="meetingEndsAt"
              type="datetime-local"
              defaultValue={toDateTimeLocal(edition.meetingEndsAt)}
              className="cap-input"
            />
          </div>
          <div className="stack-1">
            <label htmlFor="venueName" className="cap-field-label">
              Venue
            </label>
            <input
              id="venueName"
              name="venueName"
              type="text"
              defaultValue={edition.venueName ?? ""}
              placeholder="University Conference Center"
              className="cap-input"
            />
          </div>
          <div className="stack-1">
            <label htmlFor="venueAddress" className="cap-field-label">
              Address
            </label>
            <input
              id="venueAddress"
              name="venueAddress"
              type="text"
              defaultValue={edition.venueAddress ?? ""}
              className="cap-input"
            />
          </div>
          <div className="stack-1">
            <label htmlFor="city" className="cap-field-label">
              City
            </label>
            <input
              id="city"
              name="city"
              type="text"
              defaultValue={edition.city ?? ""}
              className="cap-input"
            />
          </div>
        </fieldset>

        <fieldset className="card stack-4">
          <legend className="legend">Registration window</legend>
          <div className="stack-1">
            <label htmlFor="registrationOpensAt" className="cap-field-label">
              Opens
            </label>
            <input
              id="registrationOpensAt"
              name="registrationOpensAt"
              type="datetime-local"
              defaultValue={toDateTimeLocal(edition.registrationOpensAt)}
              className="cap-input"
            />
          </div>
          <div className="stack-1">
            <label htmlFor="registrationClosesAt" className="cap-field-label">
              Deadline
            </label>
            <input
              id="registrationClosesAt"
              name="registrationClosesAt"
              type="datetime-local"
              defaultValue={toDateTimeLocal(edition.registrationClosesAt)}
              className="cap-input"
            />
          </div>
        </fieldset>

        <fieldset className="card stack-4">
          <legend className="legend">Submission window</legend>
          <div className="stack-1">
            <label htmlFor="submissionOpensAt" className="cap-field-label">
              Opens
            </label>
            <input
              id="submissionOpensAt"
              name="submissionOpensAt"
              type="datetime-local"
              defaultValue={toDateTimeLocal(edition.submissionOpensAt)}
              className="cap-input"
            />
          </div>
          <div className="stack-1">
            <label htmlFor="submissionDeadline" className="cap-field-label">
              Deadline
            </label>
            <input
              id="submissionDeadline"
              name="submissionDeadline"
              type="datetime-local"
              defaultValue={toDateTimeLocal(edition.submissionDeadline)}
              className="cap-input"
            />
          </div>
        </fieldset>

        <div className="cluster">
          <button type="submit" disabled={submitting} className="cap-btn" data-variant="primary">
            {submitting ? "Saving..." : "Save changes"}
          </button>
          <Link to="/admin" className="small strong cap-muted">
            Cancel
          </Link>
        </div>
      </Form>
    </div>
  );
}
