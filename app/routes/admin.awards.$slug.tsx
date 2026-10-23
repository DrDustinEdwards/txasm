import { Form, Link, redirect, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/admin.awards.$slug";
import { cloudflareContext } from "~/load-context";
import { requireAdmin } from "~/lib/auth.server";
import {
  AlreadyExistsError,
  NotFoundError,
  ValidationError,
  getDataAccess,
  type AwardRecipientView,
} from "~/lib/data-access";
import { pageTitle } from "~/lib/site-meta";

export function meta({ matches }: Route.MetaArgs) {
  return [{ title: pageTitle(matches, "Manage award") }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { actor } = await requireAdmin(request);
  const da = getDataAccess(context.get(cloudflareContext).env);
  const { award } = await da.awards.getBySlug(params.slug);
  const recipients = await da.awardRecipients.listForAward(award.id);
  const editionRows = await da.editions.list(actor);
  const editions = editionRows.map((e) => ({ id: e.id, name: e.name }));
  return {
    award: {
      id: award.id,
      slug: award.slug,
      name: award.name,
      namesakeBio: award.namesakeBio,
      description: award.description,
      sortOrder: award.sortOrder,
    },
    recipients,
    editions,
  };
}

function parseSortOrder(value: FormDataEntryValue | null): number {
  const raw = String(value ?? "0").trim() || "0";
  const n = Number(raw);
  if (!Number.isInteger(n)) {
    throw new ValidationError("Sort order must be a whole number.");
  }
  return n;
}

function optionalId(value: FormDataEntryValue | null): string | null {
  const raw = String(value ?? "").trim();
  return raw.length > 0 ? raw : null;
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const { actor } = await requireAdmin(request);
  const da = getDataAccess(context.get(cloudflareContext).env);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const back = `/admin/awards/${params.slug}`;

  try {
    const { award } = await da.awards.getBySlug(params.slug);

    if (intent === "award-update") {
      const updated = await da.awards.update(actor, award.id, {
        name: String(form.get("name") ?? ""),
        slug: String(form.get("slug") ?? ""),
        namesakeBio: String(form.get("namesakeBio") ?? ""),
        description: String(form.get("description") ?? ""),
        sortOrder: parseSortOrder(form.get("sortOrder")),
      });
      return redirect(`/admin/awards/${updated?.slug ?? params.slug}`);
    }

    if (intent === "recipient-remove") {
      const id = String(form.get("recipientId") ?? "");
      if (id) await da.awardRecipients.remove(actor, id);
      return redirect(back);
    }

    if (intent === "recipient-create") {
      await da.awardRecipients.create(actor, {
        awardId: award.id,
        editionId: optionalId(form.get("editionId")),
        year: String(form.get("year") ?? ""),
        category: String(form.get("category") ?? ""),
        placement: String(form.get("placement") ?? ""),
        personName: String(form.get("personName") ?? ""),
        institution: String(form.get("institution") ?? ""),
        mentor: String(form.get("mentor") ?? ""),
        sortOrder: parseSortOrder(form.get("sortOrder")),
      });
      return redirect(back);
    }

    if (intent === "recipient-update") {
      await da.awardRecipients.update(actor, String(form.get("recipientId") ?? ""), {
        editionId: optionalId(form.get("editionId")),
        year: String(form.get("year") ?? ""),
        category: String(form.get("category") ?? ""),
        placement: String(form.get("placement") ?? ""),
        personName: String(form.get("personName") ?? ""),
        institution: String(form.get("institution") ?? ""),
        mentor: String(form.get("mentor") ?? ""),
        sortOrder: parseSortOrder(form.get("sortOrder")),
      });
      return redirect(back);
    }
  } catch (error) {
    if (
      error instanceof ValidationError ||
      error instanceof NotFoundError ||
      error instanceof AlreadyExistsError
    ) {
      return { error: error.message };
    }
    throw error;
  }

  return { error: "Unknown action." };
}

type Edition = Route.ComponentProps["loaderData"]["editions"][number];

function RecipientFields({
  recipient,
  editions,
}: {
  recipient?: AwardRecipientView;
  editions: Edition[];
}) {
  const base = recipient ? recipient.id : "new";
  return (
    <div className="grid-2">
      <div className="stack-1">
        <label htmlFor={`person-${base}`} className="cap-field-label">
          Recipient name
        </label>
        <input
          id={`person-${base}`}
          name="personName"
          type="text"
          required
          defaultValue={recipient?.personName ?? ""}
          className="cap-input"
        />
      </div>
      <div className="stack-1">
        <label htmlFor={`year-${base}`} className="cap-field-label">
          Year
        </label>
        <input
          id={`year-${base}`}
          name="year"
          type="text"
          required
          placeholder="2025-26"
          defaultValue={recipient?.year ?? ""}
          className="cap-input"
        />
      </div>
      <div className="stack-1">
        <label htmlFor={`institution-${base}`} className="cap-field-label">
          Institution
        </label>
        <input
          id={`institution-${base}`}
          name="institution"
          type="text"
          defaultValue={recipient?.institution ?? ""}
          className="cap-input"
        />
      </div>
      <div className="stack-1">
        <label htmlFor={`mentor-${base}`} className="cap-field-label">
          Mentor
        </label>
        <input
          id={`mentor-${base}`}
          name="mentor"
          type="text"
          defaultValue={recipient?.mentor ?? ""}
          className="cap-input"
        />
      </div>
      <div className="stack-1">
        <label htmlFor={`category-${base}`} className="cap-field-label">
          Category
        </label>
        <input
          id={`category-${base}`}
          name="category"
          type="text"
          placeholder="Molecular and Environmental"
          defaultValue={recipient?.category ?? ""}
          className="cap-input"
        />
      </div>
      <div className="stack-1">
        <label htmlFor={`placement-${base}`} className="cap-field-label">
          Placement
        </label>
        <input
          id={`placement-${base}`}
          name="placement"
          type="text"
          placeholder="1st"
          defaultValue={recipient?.placement ?? ""}
          className="cap-input"
        />
      </div>
      <div className="stack-1">
        <label htmlFor={`edition-${base}`} className="cap-field-label">
          Meeting
        </label>
        <select
          id={`edition-${base}`}
          name="editionId"
          defaultValue={recipient?.editionId ?? ""}
          className="cap-select"
        >
          <option value="">Not linked to a meeting</option>
          {editions.map((edition) => (
            <option key={edition.id} value={edition.id}>
              {edition.name}
            </option>
          ))}
        </select>
      </div>
      <div className="stack-1">
        <label htmlFor={`sort-${base}`} className="cap-field-label">
          Sort order
        </label>
        <input
          id={`sort-${base}`}
          name="sortOrder"
          type="number"
          step="1"
          defaultValue={recipient ? undefined : 0}
          className="cap-input"
        />
      </div>
    </div>
  );
}

export default function AdminAwardDetail({ loaderData }: Route.ComponentProps) {
  const { award, recipients, editions } = loaderData;
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";
  const error = actionData?.error ?? null;

  return (
    <div className="form-page stack-8">
      <header className="stack-2">
        <p className="small">
          <Link to="/admin/awards">All awards</Link>
        </p>
        <h1 className="page-title">{award.name}</h1>
        <p className="cap-muted">
          Public page: <Link to={`/awards/${award.slug}`}>/awards/{award.slug}</Link>
        </p>
      </header>

      {error ? (
        <p role="alert" className="cap-banner" data-tone="info">
          {error}
        </p>
      ) : null}

      <section aria-labelledby="definition-heading" className="card stack-4">
        <h2 id="definition-heading" className="subsection-title">
          Award definition
        </h2>
        <Form method="post" className="stack-4" noValidate>
          <input type="hidden" name="intent" value="award-update" />
          <div className="grid-2">
            <div className="stack-1">
              <label htmlFor="name" className="cap-field-label">
                Name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                defaultValue={award.name}
                className="cap-input"
              />
            </div>
            <div className="stack-1">
              <label htmlFor="slug" className="cap-field-label">
                Slug
              </label>
              <input
                id="slug"
                name="slug"
                type="text"
                defaultValue={award.slug}
                className="cap-input"
              />
            </div>
          </div>
          <div className="stack-1">
            <label htmlFor="namesakeBio" className="cap-field-label">
              Namesake bio
            </label>
            <textarea
              id="namesakeBio"
              name="namesakeBio"
              rows={3}
              defaultValue={award.namesakeBio ?? ""}
              className="cap-input"
            />
          </div>
          <div className="stack-1">
            <label htmlFor="description" className="cap-field-label">
              Description
            </label>
            <textarea
              id="description"
              name="description"
              rows={2}
              defaultValue={award.description ?? ""}
              className="cap-input"
            />
            <p className="tiny cap-muted">
              Bio and description support italics, superscript, and subscript.
            </p>
          </div>
          <div className="stack-1 short-field">
            <label htmlFor="sortOrder" className="cap-field-label">
              Sort order
            </label>
            <input
              id="sortOrder"
              name="sortOrder"
              type="number"
              step="1"
              defaultValue={award.sortOrder}
              className="cap-input"
            />
          </div>
          <button type="submit" disabled={submitting} className="cap-btn" data-variant="primary">
            Save definition
          </button>
        </Form>
      </section>

      <section aria-labelledby="recipients-heading" className="stack-4">
        <h2 id="recipients-heading" className="subsection-title">
          Recipients
        </h2>
        {recipients.length === 0 ? (
          <p className="cap-muted">No recipients yet. Add the first below.</p>
        ) : (
          <ul className="stack-3">
            {recipients.map((recipient) => (
              <li key={recipient.id} className="card stack-3">
                <div className="spread">
                  <div className="shrink">
                    <p className="strong">
                      {recipient.year} &middot; {recipient.personName}
                    </p>
                    <p className="small cap-muted">
                      {[
                        recipient.category ?? "",
                        recipient.placement ?? "",
                        recipient.institution ?? "",
                        recipient.mentor ? `Mentor: ${recipient.mentor}` : "",
                      ]
                        .filter((p) => p.length > 0)
                        .join(" · ")}
                    </p>
                  </div>
                  <Form method="post">
                    <input type="hidden" name="intent" value="recipient-remove" />
                    <input type="hidden" name="recipientId" value={recipient.id} />
                    <button
                      type="submit"
                      onClick={(e) => {
                        if (!window.confirm(`Remove ${recipient.personName}?`)) {
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
                  <summary className="summary">Edit recipient</summary>
                  <Form method="post" className="stack-3 mt-3" noValidate>
                    <input type="hidden" name="intent" value="recipient-update" />
                    <input type="hidden" name="recipientId" value={recipient.id} />
                    <RecipientFields recipient={recipient} editions={editions} />
                    <button type="submit" disabled={submitting} className="cap-btn">
                      Save recipient
                    </button>
                  </Form>
                </details>
              </li>
            ))}
          </ul>
        )}

        <section aria-labelledby="add-recipient-heading" className="card stack-4">
          <h3 id="add-recipient-heading" className="strong">
            Add a recipient
          </h3>
          <Form method="post" className="stack-4" noValidate>
            <input type="hidden" name="intent" value="recipient-create" />
            <RecipientFields editions={editions} />
            <button type="submit" disabled={submitting} className="cap-btn" data-variant="primary">
              {submitting ? "Adding..." : "Add recipient"}
            </button>
          </Form>
        </section>
      </section>
    </div>
  );
}
