import { Form, redirect, useActionData, useNavigation } from "react-router";
import { Link } from "capsomer/react/link";
import type { Route } from "./+types/admin.editions.$editionId.abstract-categories";
import { privateMeta } from "~/lib/site-meta";
import { cloudflareContext } from "~/load-context";
import { requireAdmin } from "~/lib/auth.server";
import { AlreadyExistsError, ValidationError, getDataAccess } from "~/lib/data-access";
import { readForm } from "~/lib/form.server";

export function meta({ matches }: Route.MetaArgs) {
  return privateMeta(matches, "Abstract categories");
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { actor } = await requireAdmin(request);
  const { env } = context.get(cloudflareContext);
  const da = getDataAccess(env);
  const edition = await da.editions.getById(actor, params.editionId);
  const categories = await da.abstractCategories.listForEdition(actor, params.editionId);
  return { edition, categories };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const { actor } = await requireAdmin(request);
  const form = await readForm(request);
  const intent = String(form.get("intent") ?? "");
  const da = getDataAccess(context.get(cloudflareContext).env);
  const back = `/admin/editions/${params.editionId}/abstract-categories`;

  try {
    if (intent === "remove") {
      const id = String(form.get("categoryId") ?? "");
      if (id) await da.abstractCategories.remove(actor, id);
      return redirect(back);
    }

    if (intent === "update") {
      const id = String(form.get("categoryId") ?? "");
      const name = String(form.get("name") ?? "");
      const sortOrder = Number(String(form.get("sortOrder") ?? "0").trim() || "0");
      if (!Number.isInteger(sortOrder)) {
        return { error: "Sort order must be a whole number." };
      }
      await da.abstractCategories.update(actor, id, { name, sortOrder });
      return redirect(back);
    }

    if (intent === "create") {
      const name = String(form.get("name") ?? "");
      const sortOrder = Number(String(form.get("sortOrder") ?? "0").trim() || "0");
      if (!Number.isInteger(sortOrder)) {
        return { error: "Sort order must be a whole number." };
      }
      await da.abstractCategories.create(actor, {
        editionId: params.editionId,
        name,
        sortOrder,
      });
      return redirect(back);
    }
  } catch (error) {
    if (error instanceof ValidationError || error instanceof AlreadyExistsError) {
      return { error: error.message };
    }
    throw error;
  }

  return { error: "Unknown action." };
}

export default function AbstractCategories({ loaderData }: Route.ComponentProps) {
  const { edition, categories } = loaderData;
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";
  const error = actionData?.error ?? null;

  return (
    <div className="stack-8">
      <div className="stack-2">
        <h1 className="page-title">Abstract categories</h1>
        <p>
          {edition.name}.{" "}
          <Link to={`/admin/editions/${edition.id}`} className="strong">
            Edit meeting
          </Link>
        </p>
        <p className="cap-muted">Authors choose one of these when they submit an abstract.</p>
      </div>

      {error ? (
        <p role="alert" className="cap-alert">
          {error}
        </p>
      ) : null}

      {categories.length === 0 ? (
        <p>No categories yet. Add the first below.</p>
      ) : (
        <ul className="stack-3">
          {categories.map((category) => (
            <li key={category.id} className="card card-s">
              <Form method="post" className="cluster cluster-end">
                <input type="hidden" name="intent" value="update" />
                <input type="hidden" name="categoryId" value={category.id} />
                <div className="grow stack-1">
                  <label htmlFor={`name-${category.id}`} className="cap-field-label">
                    Name
                  </label>
                  <input
                    id={`name-${category.id}`}
                    name="name"
                    type="text"
                    defaultValue={category.name}
                    required
                    className="cap-input"
                  />
                </div>
                <div className="stack-1 tiny-field">
                  <label htmlFor={`sort-${category.id}`} className="cap-field-label">
                    Sort
                  </label>
                  <input
                    id={`sort-${category.id}`}
                    name="sortOrder"
                    type="number"
                    step="1"
                    defaultValue={category.sortOrder}
                    className="cap-input"
                  />
                </div>
                <button type="submit" className="cap-btn">
                  Save
                </button>
              </Form>
              <Form method="post" className="mt-2">
                <input type="hidden" name="intent" value="remove" />
                <input type="hidden" name="categoryId" value={category.id} />
                <button type="submit" className="link-button small strong">
                  Remove
                </button>
              </Form>
            </li>
          ))}
        </ul>
      )}

      <section className="card stack-4">
        <h2 className="subsection-title">Add a category</h2>
        <Form method="post" className="stack-4" noValidate>
          <input type="hidden" name="intent" value="create" />
          <div className="stack-1">
            <label htmlFor="name" className="cap-field-label">
              Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              placeholder="Environmental Microbiology"
              className="cap-input"
            />
          </div>
          <div className="stack-1">
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
            {submitting ? "Adding..." : "Add category"}
          </button>
        </Form>
      </section>
    </div>
  );
}
