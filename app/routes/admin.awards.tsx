import { Form, redirect, useActionData, useNavigation } from "react-router";
import { Link } from "capsomer/react/link";
import type { Route } from "./+types/admin.awards";
import { cloudflareContext } from "@dustinedwards/site-runtime/context";
import { requireAdmin } from "~/lib/auth.server";
import {
  AlreadyExistsError,
  NotFoundError,
  ValidationError,
  getDataAccess,
} from "~/lib/data-access";
import { privateMeta } from "~/lib/site-meta";
import { readForm } from "@dustinedwards/site-runtime/body";
import { parseSortOrder, FORM_LIMIT } from "~/lib/form.server";
import { confirmSubmit } from "capsomer/behavior/confirm-dialog";

export function meta({ matches }: Route.MetaArgs) {
  return privateMeta(matches, "Awards");
}

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireAdmin(request);
  const da = getDataAccess(context.get(cloudflareContext).env);
  const list = await da.awards.listAll();
  const counts = await Promise.all(
    list.map((a) => da.awardRecipients.listForAward(a.id).then((r) => r.length)),
  );
  const awards = list.map((a, i) => ({
    id: a.id,
    slug: a.slug,
    name: a.name,
    description: a.description,
    sortOrder: a.sortOrder,
    recipientCount: counts[i],
  }));
  return { awards };
}

export async function action({ request, context }: Route.ActionArgs) {
  const { actor } = await requireAdmin(request);
  const da = getDataAccess(context.get(cloudflareContext).env);
  const form = await readForm(request, FORM_LIMIT);
  const intent = String(form.get("intent") ?? "");

  try {
    if (intent === "remove") {
      const id = String(form.get("awardId") ?? "");
      if (id) await da.awards.remove(actor, id);
      return redirect("/admin/awards");
    }

    if (intent === "create") {
      const created = await da.awards.create(actor, {
        slug: String(form.get("slug") ?? ""),
        name: String(form.get("name") ?? ""),
        namesakeBio: String(form.get("namesakeBio") ?? ""),
        description: String(form.get("description") ?? ""),
        sortOrder: parseSortOrder(form.get("sortOrder")),
      });
      return redirect(`/admin/awards/${created.slug}`);
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

export default function AdminAwards({ loaderData }: Route.ComponentProps) {
  const { awards } = loaderData;
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";
  const error = actionData?.error ?? null;

  return (
    <div className="cap-stack" data-gap="7">
      <header className="cap-stack" data-gap="3">
        <h1 className="page-title">Awards</h1>
        <p className="cap-muted">
          The branch's named awards. Edit an award to manage its recipients, the every-meeting
          maintenance path. Public pages read this data.
        </p>
      </header>

      {error ? (
        <p role="alert" className="cap-banner" data-tone="info">
          {error}
        </p>
      ) : null}

      {awards.length === 0 ? (
        <p className="cap-muted">No awards yet. Add the first below.</p>
      ) : (
        <ul className="cap-stack" data-gap="4">
          {awards.map((award) => (
            <li key={award.id} className="card cap-spread">
              <div className="shrink">
                <Link to={`/admin/awards/${award.slug}`} className="strong">
                  {award.name}
                </Link>
                <p className="small cap-muted">
                  {award.slug} &middot; {award.recipientCount}{" "}
                  {award.recipientCount === 1 ? "recipient" : "recipients"}
                </p>
              </div>
              <div className="cap-cluster">
                <Link to={`/admin/awards/${award.slug}`} className="small strong">
                  Manage
                </Link>
                <Form method="post">
                  <input type="hidden" name="intent" value="remove" />
                  <input type="hidden" name="awardId" value={award.id} />
                  <button
                    type="submit"
                    onClick={(e) =>
                      confirmSubmit(e, {
                        title: `Remove ${award.name} and all its recipients?`,
                        action: "Remove award",
                      })
                    }
                    className="small strong"
                  >
                    Remove
                  </button>
                </Form>
              </div>
            </li>
          ))}
        </ul>
      )}

      <section aria-labelledby="add-award-heading" className="card cap-stack">
        <h2 id="add-award-heading" className="subsection-title">
          Add an award
        </h2>
        <Form method="post" className="cap-stack" noValidate>
          <input type="hidden" name="intent" value="create" />
          <div className="cap-grid" data-cols="2">
            <div className="cap-stack" data-gap="2">
              <label htmlFor="name" className="cap-field-label">
                Name
              </label>
              <input id="name" name="name" type="text" required className="cap-input" />
            </div>
            <div className="cap-stack" data-gap="2">
              <label htmlFor="slug" className="cap-field-label">
                Slug
              </label>
              <input
                id="slug"
                name="slug"
                type="text"
                placeholder="s-e-sulkin-award"
                className="cap-input"
              />
              <p className="tiny cap-muted">Leave blank to derive from the name.</p>
            </div>
          </div>
          <div className="cap-stack" data-gap="2">
            <label htmlFor="namesakeBio" className="cap-field-label">
              Namesake bio
            </label>
            <textarea id="namesakeBio" name="namesakeBio" rows={2} className="cap-input" />
          </div>
          <div className="cap-stack" data-gap="2">
            <label htmlFor="description" className="cap-field-label">
              Description
            </label>
            <textarea id="description" name="description" rows={2} className="cap-input" />
            <p className="tiny cap-muted">
              Bio and description support italics, superscript, and subscript.
            </p>
          </div>
          <div className="cap-stack short-field" data-gap="2">
            <label htmlFor="sortOrder" className="cap-field-label">
              Sort order
            </label>
            <input
              id="sortOrder"
              name="sortOrder"
              type="number"
              step="1"
              defaultValue={0}
              className="cap-input"
            />
          </div>
          <button type="submit" disabled={submitting} className="cap-btn" data-variant="primary">
            {submitting ? "Adding..." : "Add award"}
          </button>
        </Form>
      </section>
    </div>
  );
}
