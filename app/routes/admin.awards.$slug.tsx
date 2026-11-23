import { Stack } from "capsomer/react/stack";
import { Field, TextField } from "capsomer/react/field";
import { Form, redirect, useActionData, useNavigation } from "react-router";
import { Panel } from "capsomer/react/panel";
import { Disclosure } from "capsomer/react/disclosure";
import { Link } from "capsomer/react/link";
import type { Route } from "./+types/admin.awards.$slug";
import { cloudflareContext } from "@dustinedwards/site-runtime/context";
import { requireAdmin } from "~/lib/auth.server";
import { getDataAccess, type AwardRecipientView } from "~/lib/data-access";
import { pageTitle } from "~/lib/site-meta";
import { privateMeta } from "@drdustinedwards/site-helpers/head";
import { readForm } from "@dustinedwards/site-runtime/body";
import { formError, parseSortOrder, FORM_LIMIT } from "~/lib/form.server";
import { confirmSubmit } from "capsomer/behavior/confirm-dialog";

export function meta({ matches }: Route.MetaArgs) {
  return privateMeta(pageTitle(matches, "Manage award"));
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

function optionalId(value: FormDataEntryValue | null): string | null {
  const raw = String(value ?? "").trim();
  return raw.length > 0 ? raw : null;
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const { actor } = await requireAdmin(request);
  const da = getDataAccess(context.get(cloudflareContext).env);
  const form = await readForm(request, FORM_LIMIT);
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
    return formError(error);
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
    <div className="cap-grid" data-cols="2">
      <TextField
        id={`person-${base}`}
        label="Recipient name"
        name="personName"
        type="text"
        required
        defaultValue={recipient?.personName ?? ""}
      />
      <TextField
        id={`year-${base}`}
        label="Year"
        name="year"
        type="text"
        required
        placeholder="2025-26"
        defaultValue={recipient?.year ?? ""}
      />
      <TextField
        id={`institution-${base}`}
        label="Institution"
        name="institution"
        type="text"
        defaultValue={recipient?.institution ?? ""}
      />
      <TextField
        id={`mentor-${base}`}
        label="Mentor"
        name="mentor"
        type="text"
        defaultValue={recipient?.mentor ?? ""}
      />
      <TextField
        id={`category-${base}`}
        label="Category"
        name="category"
        type="text"
        placeholder="Molecular and Environmental"
        defaultValue={recipient?.category ?? ""}
      />
      <TextField
        id={`placement-${base}`}
        label="Placement"
        name="placement"
        type="text"
        placeholder="1st"
        defaultValue={recipient?.placement ?? ""}
      />
      <Field label="Meeting" id={`edition-${base}`}>
        <select name="editionId" defaultValue={recipient?.editionId ?? ""} className="cap-select">
          <option value="">Not linked to a meeting</option>
          {editions.map((edition) => (
            <option key={edition.id} value={edition.id}>
              {edition.name}
            </option>
          ))}
        </select>
      </Field>
      <TextField
        id={`sort-${base}`}
        label="Sort order"
        name="sortOrder"
        type="number"
        step="1"
        defaultValue={recipient ? undefined : 0}
      />
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
    <div className="form-page cap-stack" data-gap="7">
      <Stack as="header" gap={3}>
        <p className="small">
          <Link to="/admin/awards">All awards</Link>
        </p>
        <h1 className="page-title">{award.name}</h1>
        <p className="cap-muted">
          Public page: <Link to={`/awards/${award.slug}`}>/awards/{award.slug}</Link>
        </p>
      </Stack>

      {error ? (
        <p role="alert" className="cap-banner" data-tone="info">
          {error}
        </p>
      ) : null}

      <Panel title="Award definition" headingId="definition-heading">
        <Stack as={Form} method="post" noValidate>
          <input type="hidden" name="intent" value="award-update" />
          <div className="cap-grid" data-cols="2">
            <TextField
              id="name"
              label="Name"
              name="name"
              type="text"
              required
              defaultValue={award.name}
            />
            <TextField id="slug" label="Slug" name="slug" type="text" defaultValue={award.slug} />
          </div>
          <Stack gap={2}>
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
          </Stack>
          <Stack gap={2}>
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
          </Stack>
          <Stack gap={2} className="short-field">
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
          </Stack>
          <button type="submit" disabled={submitting} className="cap-btn" data-variant="primary">
            Save definition
          </button>
        </Stack>
      </Panel>

      <Stack as="section" aria-labelledby="recipients-heading">
        <h2 id="recipients-heading" className="subsection-title">
          Recipients
        </h2>
        {recipients.length === 0 ? (
          <p className="cap-muted">No recipients yet.</p>
        ) : (
          <Stack as="ul" gap={4}>
            {recipients.map((recipient) => (
              <li key={recipient.id} className="cap-panel">
                <div className="cap-panel-body cap-stack" data-gap="4">
                  <div className="cap-spread">
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
                        onClick={(e) =>
                          confirmSubmit(e, {
                            title: `Remove ${recipient.personName}?`,
                            action: "Remove recipient",
                          })
                        }
                        className="small strong"
                      >
                        Remove
                      </button>
                    </Form>
                  </div>
                  <Disclosure summary="Edit recipient" variant="card" size="sm" marker="triangle">
                    <Stack as={Form} method="post" noValidate gap={4}>
                      <input type="hidden" name="intent" value="recipient-update" />
                      <input type="hidden" name="recipientId" value={recipient.id} />
                      <RecipientFields recipient={recipient} editions={editions} />
                      <button type="submit" disabled={submitting} className="cap-btn">
                        Save recipient
                      </button>
                    </Stack>
                  </Disclosure>
                </div>
              </li>
            ))}
          </Stack>
        )}

        <Panel title="Add a recipient" level={3} headingId="add-recipient-heading">
          <Stack as={Form} method="post" noValidate>
            <input type="hidden" name="intent" value="recipient-create" />
            <RecipientFields editions={editions} />
            <button type="submit" disabled={submitting} className="cap-btn" data-variant="primary">
              {submitting ? "Adding..." : "Add recipient"}
            </button>
          </Stack>
        </Panel>
      </Stack>
    </div>
  );
}
