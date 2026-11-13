import { Form, redirect, useActionData, useNavigation } from "react-router";
import { Panel } from "capsomer/react/panel";
import { Link } from "capsomer/react/link";
import type { Route } from "./+types/admin.editions.$editionId";
import { pageTitle } from "~/lib/site-meta";
import { privateMeta } from "@drdustinedwards/site-helpers/head";
import { cloudflareContext } from "@dustinedwards/site-runtime/context";
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
import { DateTimeField } from "capsomer/react/field";
import { readForm } from "@dustinedwards/site-runtime/body";
import { FORM_LIMIT, parseDateTime } from "~/lib/form.server";

export function meta({ matches }: Route.MetaArgs) {
  return privateMeta(pageTitle(matches, "Edit meeting"));
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { actor } = await requireAdmin(request);
  const { env } = context.get(cloudflareContext);
  const edition = await getDataAccess(env).editions.getById(actor, params.editionId);
  return { edition };
}


export async function action({ request, context, params }: Route.ActionArgs) {
  const { actor } = await requireAdmin(request);
  const form = await readForm(request, FORM_LIMIT);
  const status = String(form.get("status") ?? "");

  if (!EDITION_STATUSES.includes(status as EditionStatus)) {
    return { error: "Choose a valid status." };
  }

  try {
    const patch: EditionPatch = {
      status: status as EditionStatus,
      registrationOpensAt: parseDateTime(form.get("registrationOpensAt")),
      registrationClosesAt: parseDateTime(form.get("registrationClosesAt")),
      submissionOpensAt: parseDateTime(form.get("submissionOpensAt")),
      submissionDeadline: parseDateTime(form.get("submissionDeadline")),
      meetingStartsAt: parseDateTime(form.get("meetingStartsAt")),
      meetingEndsAt: parseDateTime(form.get("meetingEndsAt")),
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
    <div className="form-page cap-stack" data-gap="6">
      <div className="cap-stack" data-gap="3">
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

      <Form method="post" className="cap-stack" noValidate>
        <div className="cap-stack" data-gap="2">
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

        <Panel title="Meeting dates and venue">
          <div className="cap-stack">
            <DateTimeField
              id="meetingStartsAt"
              name="meetingStartsAt"
              label="Starts"
              defaultDate={edition.meetingStartsAt}
            />
            <DateTimeField
              id="meetingEndsAt"
              name="meetingEndsAt"
              label="Ends"
              defaultDate={edition.meetingEndsAt}
            />
            <div className="cap-stack" data-gap="2">
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
            <div className="cap-stack" data-gap="2">
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
            <div className="cap-stack" data-gap="2">
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
          </div>
        </Panel>

        <Panel title="Registration window">
          <div className="cap-stack">
            <DateTimeField
              id="registrationOpensAt"
              name="registrationOpensAt"
              label="Opens"
              defaultDate={edition.registrationOpensAt}
            />
            <DateTimeField
              id="registrationClosesAt"
              name="registrationClosesAt"
              label="Deadline"
              defaultDate={edition.registrationClosesAt}
            />
          </div>
        </Panel>

        <Panel title="Submission window">
          <div className="cap-stack">
            <DateTimeField
              id="submissionOpensAt"
              name="submissionOpensAt"
              label="Opens"
              defaultDate={edition.submissionOpensAt}
            />
            <DateTimeField
              id="submissionDeadline"
              name="submissionDeadline"
              label="Deadline"
              defaultDate={edition.submissionDeadline}
            />
          </div>
        </Panel>

        <div className="cap-cluster">
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
