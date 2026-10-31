import { Form, redirect, useActionData, useNavigation } from "react-router";
import { Link } from "capsomer/react/link";
import type { Route } from "./+types/admin.officers";
import { cloudflareContext } from "~/load-context";
import { requireAdmin } from "~/lib/auth.server";
import { getDataAccess, NotFoundError, ValidationError } from "~/lib/data-access";
import { OFFICER_SECTION_LABELS, OFFICER_SECTIONS, type OfficerSection } from "~/lib/vocab";
import { privateMeta } from "~/lib/site-meta";
import { parseSortOrder, readForm } from "~/lib/form.server";

export function meta({ matches }: Route.MetaArgs) {
  return privateMeta(matches, "Branch officers");
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const { actor } = await requireAdmin(request);
  const da = getDataAccess(context.get(cloudflareContext).env);
  return { rows: await da.branchOfficers.listAll(actor) };
}

function readInput(form: FormData) {
  const text = (key: string) => String(form.get(key) ?? "");
  return {
    section: text("section") as OfficerSection,
    role: text("role"),
    name: text("name"),
    affiliation: text("affiliation"),
    location: text("location"),
    phone: text("phone"),
    email: text("email"),
    term: text("term"),
    sortOrder: parseSortOrder(form.get("sortOrder")),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const { actor } = await requireAdmin(request);
  const da = getDataAccess(context.get(cloudflareContext).env);
  const form = await readForm(request);
  const intent = String(form.get("intent") ?? "");

  try {
    if (intent === "remove") {
      const id = String(form.get("id") ?? "");
      if (id) await da.branchOfficers.remove(actor, id);
      return redirect("/admin/officers");
    }
    if (intent === "create") {
      await da.branchOfficers.create(actor, readInput(form));
      return redirect("/admin/officers");
    }
    if (intent === "update") {
      await da.branchOfficers.update(actor, String(form.get("id") ?? ""), readInput(form));
      return redirect("/admin/officers");
    }
  } catch (error) {
    if (error instanceof ValidationError || error instanceof NotFoundError) {
      return { error: error.message };
    }
    throw error;
  }

  return { error: "Unknown action." };
}

type Row = Route.ComponentProps["loaderData"]["rows"][number];

function Field({
  id,
  name,
  label,
  defaultValue,
  type = "text",
  hint,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue?: string | number | null;
  type?: string;
  hint?: string;
}) {
  return (
    <div className="stack-1">
      <label htmlFor={id} className="cap-field-label">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        step={type === "number" ? "1" : undefined}
        defaultValue={defaultValue ?? ""}
        className="cap-input"
      />
      {hint ? <p className="tiny cap-muted">{hint}</p> : null}
    </div>
  );
}

function OfficerFields({ row, section }: { row?: Row; section: OfficerSection }) {
  const p = row ? `o-${row.id}` : `new-${section}`;
  return (
    <div className="grid-2">
      <div className="stack-1">
        <label htmlFor={`${p}-section`} className="cap-field-label">
          Section
        </label>
        <select
          id={`${p}-section`}
          name="section"
          defaultValue={row?.section ?? section}
          className="cap-select"
        >
          {OFFICER_SECTIONS.map((s) => (
            <option key={s} value={s}>
              {OFFICER_SECTION_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      <Field
        id={`${p}-role`}
        name="role"
        label="Office"
        defaultValue={row?.role}
        hint="President, Treasurer, and so on. Past officers are grouped by office."
      />
      <Field id={`${p}-name`} name="name" label="Name" defaultValue={row?.name} />
      <Field
        id={`${p}-affiliation`}
        name="affiliation"
        label="Affiliation or institution"
        defaultValue={row?.affiliation}
      />
      <Field
        id={`${p}-term`}
        name="term"
        label="Term"
        defaultValue={row?.term}
        hint="Past officers only, e.g. 2024-2025."
      />
      <Field
        id={`${p}-location`}
        name="location"
        label="Location"
        defaultValue={row?.location}
        hint="Current officers only."
      />
      <Field id={`${p}-phone`} name="phone" label="Phone" defaultValue={row?.phone} />
      <Field id={`${p}-email`} name="email" label="Email" type="email" defaultValue={row?.email} />
      <Field
        id={`${p}-sortOrder`}
        name="sortOrder"
        label="Sort order"
        type="number"
        defaultValue={row?.sortOrder ?? 0}
        hint="Lower comes first."
      />
    </div>
  );
}

function summary(row: Row): string {
  if (row.section === "past") {
    return [row.term ?? "Dates not recorded", row.name ?? "Not recorded", row.affiliation ?? ""]
      .filter((p) => p.length > 0)
      .join(" · ");
  }
  return [row.name ?? "", row.affiliation ?? ""].filter((p) => p.length > 0).join(" · ");
}

function OfficerRow({ row, submitting }: { row: Row; submitting: boolean }) {
  const section = row.section;
  return (
    <li className="card stack-3">
      <div className="spread">
        <div className="shrink">
          {row.role ? <p className="cap-label">{row.role}</p> : null}
          <p className="small">{summary(row)}</p>
        </div>
        <Form method="post">
          <input type="hidden" name="intent" value="remove" />
          <input type="hidden" name="id" value={row.id} />
          <button
            type="submit"
            onClick={(e) => {
              if (!window.confirm(`Remove ${row.name ?? "this entry"}?`)) {
                e.preventDefault();
              }
            }}
            className="small strong"
          >
            Remove
          </button>
        </Form>
      </div>
      <details className="card card-s">
        <summary className="summary">Edit</summary>
        <Form method="post" className="stack-3 mt-3" noValidate>
          <input type="hidden" name="intent" value="update" />
          <input type="hidden" name="id" value={row.id} />
          <OfficerFields row={row} section={section} />
          <button type="submit" disabled={submitting} className="cap-btn">
            Save
          </button>
        </Form>
      </details>
    </li>
  );
}

// Past officers grouped by office, each office folded so the long history
// stays scannable. Offices keep the order their first row sorts in.
function PastGroups({ rows, submitting }: { rows: Row[]; submitting: boolean }) {
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const office = row.role ?? "";
    groups.set(office, [...(groups.get(office) ?? []), row]);
  }
  return (
    <div className="stack-3">
      {[...groups].map(([office, officeRows]) => (
        <details key={office} className="card card-s">
          <summary className="summary">
            {office} ({officeRows.length})
          </summary>
          <ul className="stack-3 mt-3">
            {officeRows.map((row) => (
              <OfficerRow key={row.id} row={row} submitting={submitting} />
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}

export default function AdminOfficers({ loaderData }: Route.ComponentProps) {
  const { rows } = loaderData;
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";
  const error = actionData?.error ?? null;

  return (
    <div className="form-page stack-8">
      <header className="stack-2">
        <h1 className="page-title">Branch officers</h1>
        <p className="cap-muted">
          The current officers, the advisory board and the past officers. The{" "}
          <Link to="/branch-officers">public page</Link> reads this list.
        </p>
      </header>

      {error ? (
        <p role="alert" className="cap-banner" data-tone="info">
          {error}
        </p>
      ) : null}

      {OFFICER_SECTIONS.map((section) => {
        const sectionRows = rows.filter((r) => r.section === section);
        return (
          <section key={section} aria-labelledby={`${section}-heading`} className="stack-4">
            <h2 id={`${section}-heading`} className="subsection-title">
              {OFFICER_SECTION_LABELS[section]}
            </h2>
            {sectionRows.length === 0 ? (
              <p className="cap-muted">None yet.</p>
            ) : section === "past" ? (
              <PastGroups rows={sectionRows} submitting={submitting} />
            ) : (
              <ul className="stack-3">
                {sectionRows.map((row) => (
                  <OfficerRow key={row.id} row={row} submitting={submitting} />
                ))}
              </ul>
            )}
          </section>
        );
      })}

      <section aria-labelledby="add-officer-heading" className="card stack-4">
        <h2 id="add-officer-heading" className="subsection-title">
          Add a person
        </h2>
        <Form method="post" className="stack-4" noValidate>
          <input type="hidden" name="intent" value="create" />
          <OfficerFields section="officer" />
          <button type="submit" disabled={submitting} className="cap-btn" data-variant="primary">
            {submitting ? "Adding..." : "Add"}
          </button>
        </Form>
      </section>
    </div>
  );
}
