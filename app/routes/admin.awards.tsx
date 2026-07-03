import { Form, Link, redirect, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/admin.awards";
import { cloudflareContext } from "~/load-context";
import { requireAdmin } from "~/lib/auth.server";
import {
  AlreadyExistsError,
  NotFoundError,
  ValidationError,
  getDataAccess,
} from "~/lib/data-access";
import { pageTitle } from "~/lib/site-meta";

export function meta({ matches }: Route.MetaArgs) {
  return [{ title: pageTitle(matches, "Awards") }];
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

function parseSortOrder(value: FormDataEntryValue | null): number {
  const raw = String(value ?? "0").trim() || "0";
  const n = Number(raw);
  if (!Number.isInteger(n)) {
    throw new ValidationError("Sort order must be a whole number.");
  }
  return n;
}

export async function action({ request, context }: Route.ActionArgs) {
  const { actor } = await requireAdmin(request);
  const da = getDataAccess(context.get(cloudflareContext).env);
  const form = await request.formData();
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

const inputClass =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

const primaryButton =
  "rounded-md bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:opacity-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-60";

export default function AdminAwards({ loaderData }: Route.ComponentProps) {
  const { awards } = loaderData;
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";
  const error = actionData?.error ?? null;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-text">Awards</h1>
        <p className="text-text-muted">
          The branch's named awards. Edit an award to manage its recipients, the
          every-meeting maintenance path. Public pages read this data.
        </p>
      </header>

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-accent/40 bg-accent/10 p-3 text-sm text-text"
        >
          {error}
        </p>
      ) : null}

      {awards.length === 0 ? (
        <p className="text-text-muted">No awards yet. Add the first below.</p>
      ) : (
        <ul className="space-y-3">
          {awards.map((award) => (
            <li
              key={award.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-surface-raised p-4"
            >
              <div className="min-w-0">
                <Link
                  to={`/admin/awards/${award.slug}`}
                  className="font-medium text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  {award.name}
                </Link>
                <p className="mt-1 text-sm text-text-muted">
                  {award.slug} &middot; {award.recipientCount}{" "}
                  {award.recipientCount === 1 ? "recipient" : "recipients"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Link
                  to={`/admin/awards/${award.slug}`}
                  className="text-sm font-medium text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  Manage
                </Link>
                <Form method="post">
                  <input type="hidden" name="intent" value="remove" />
                  <input type="hidden" name="awardId" value={award.id} />
                  <button
                    type="submit"
                    onClick={(e) => {
                      if (
                        !window.confirm(
                          `Remove ${award.name} and all its recipients?`,
                        )
                      ) {
                        e.preventDefault();
                      }
                    }}
                    className="text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    Remove
                  </button>
                </Form>
              </div>
            </li>
          ))}
        </ul>
      )}

      <section
        aria-labelledby="add-award-heading"
        className="space-y-4 rounded-lg border border-border bg-surface-raised p-5"
      >
        <h2 id="add-award-heading" className="text-lg font-medium text-text">
          Add an award
        </h2>
        <Form method="post" className="space-y-4" noValidate>
          <input type="hidden" name="intent" value="create" />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="name" className="block text-sm font-medium text-text">
                Name
              </label>
              <input id="name" name="name" type="text" required className={inputClass} />
            </div>
            <div className="space-y-1">
              <label htmlFor="slug" className="block text-sm font-medium text-text">
                Slug
              </label>
              <input
                id="slug"
                name="slug"
                type="text"
                placeholder="s-e-sulkin-award"
                className={inputClass}
              />
              <p className="text-xs text-text-muted">
                Leave blank to derive from the name.
              </p>
            </div>
          </div>
          <div className="space-y-1">
            <label
              htmlFor="namesakeBio"
              className="block text-sm font-medium text-text"
            >
              Namesake bio
            </label>
            <textarea
              id="namesakeBio"
              name="namesakeBio"
              rows={2}
              className={inputClass}
            />
          </div>
          <div className="space-y-1">
            <label
              htmlFor="description"
              className="block text-sm font-medium text-text"
            >
              Description
            </label>
            <textarea
              id="description"
              name="description"
              rows={2}
              className={inputClass}
            />
            <p className="text-xs text-text-muted">
              Bio and description support italics, superscript, and subscript.
            </p>
          </div>
          <div className="space-y-1 sm:max-w-40">
            <label
              htmlFor="sortOrder"
              className="block text-sm font-medium text-text"
            >
              Sort order
            </label>
            <input
              id="sortOrder"
              name="sortOrder"
              type="number"
              step="1"
              defaultValue={0}
              className={inputClass}
            />
          </div>
          <button type="submit" disabled={submitting} className={primaryButton}>
            {submitting ? "Adding..." : "Add award"}
          </button>
        </Form>
      </section>
    </div>
  );
}
