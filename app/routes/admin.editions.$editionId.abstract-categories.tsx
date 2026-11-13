import { Form, redirect, useActionData, useNavigation } from "react-router";
import { Panel } from "capsomer/react/panel";
import { Link } from "capsomer/react/link";
import type { Route } from "./+types/admin.editions.$editionId.abstract-categories";
import { pageTitle } from "~/lib/site-meta";
import { privateMeta } from "@drdustinedwards/site-helpers/head";
import { cloudflareContext } from "@dustinedwards/site-runtime/context";
import { requireAdmin } from "~/lib/auth.server";
import { AlreadyExistsError, ValidationError, getDataAccess } from "~/lib/data-access";
import { readForm } from "@dustinedwards/site-runtime/body";
import { FORM_LIMIT } from "~/lib/form.server";

export function meta({ matches }: Route.MetaArgs) {
  return privateMeta(pageTitle(matches, "Abstract categories"));
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
  const form = await readForm(request, FORM_LIMIT);
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
    <div className="cap-stack" data-gap="7">
      <div className="cap-stack" data-gap="3">
        <h1 className="cap-title" data-size="2">
          Abstract categories
        </h1>
        <p>
          {edition.name}.{" "}
          <Link to={`/admin/editions/${edition.id}`} className="cap-text" data-weight="strong">
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
        <ul className="cap-stack" data-gap="4">
          {categories.map((category) => (
            <li key={category.id} className="cap-panel" data-size="sm">
              <div className="cap-panel-body cap-stack" data-gap="3">
                <Form method="post" className="cap-cluster" data-align="end">
                  <input type="hidden" name="intent" value="update" />
                  <input type="hidden" name="categoryId" value={category.id} />
                  <div className="cap-grow cap-stack" data-gap="2">
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
                  <div className="cap-stack tiny-field" data-gap="2">
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
                <Form method="post">
                  <input type="hidden" name="intent" value="remove" />
                  <input type="hidden" name="categoryId" value={category.id} />
                  <button type="submit" className="cap-btn" data-variant="link" data-size="sm">
                    Remove
                  </button>
                </Form>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Panel title="Add a category">
        <Form method="post" className="cap-stack" noValidate>
          <input type="hidden" name="intent" value="create" />
          <div className="cap-stack" data-gap="2">
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
          <div className="cap-stack" data-gap="2">
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
      </Panel>
    </div>
  );
}
