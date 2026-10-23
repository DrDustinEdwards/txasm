import { Form, Link, redirect, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/admin.editions.$editionId.categories";
import { pageTitle } from "~/lib/site-meta";
import { cloudflareContext } from "~/load-context";
import { requireAdmin } from "~/lib/auth.server";
import { AlreadyExistsError, ValidationError, getDataAccess } from "~/lib/data-access";
import {
  REGISTRATION_CATEGORY_KEYS,
  REGISTRATION_CATEGORY_KEY_LABELS,
  type RegistrationCategoryKey,
} from "~/lib/vocab";
import { formatMoney, parseDollarsToCents } from "~/lib/format";

export function meta({ matches }: Route.MetaArgs) {
  return [{ title: pageTitle(matches, "Registration categories") }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { actor } = await requireAdmin(request);
  const { env } = context.get(cloudflareContext);
  const da = getDataAccess(env);
  const edition = await da.editions.getById(actor, params.editionId);
  const categories = await da.registrationCategories.listForEdition(actor, params.editionId);
  return { edition, categories };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const { actor } = await requireAdmin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const da = getDataAccess(context.get(cloudflareContext).env);

  if (intent === "deactivate") {
    const id = String(form.get("categoryId") ?? "");
    if (id) await da.registrationCategories.deactivate(actor, id);
    return redirect(`/admin/editions/${params.editionId}/categories`);
  }

  if (intent === "create") {
    const key = String(form.get("key") ?? "");
    const label = String(form.get("label") ?? "").trim();
    const currency = String(form.get("currency") ?? "usd");
    const sortOrder = Number(String(form.get("sortOrder") ?? "0").trim() || "0");
    const amountCents = parseDollarsToCents(String(form.get("fee") ?? ""));

    if (!(REGISTRATION_CATEGORY_KEYS as readonly string[]).includes(key)) {
      return { error: "Choose a category type." };
    }
    if (amountCents === null) {
      return { error: "Enter a fee of zero or more dollars." };
    }
    if (!Number.isInteger(sortOrder)) {
      return { error: "Sort order must be a whole number." };
    }

    try {
      await da.registrationCategories.create(actor, {
        editionId: params.editionId,
        key: key as RegistrationCategoryKey,
        label,
        amountCents,
        currency,
        sortOrder,
      });
    } catch (error) {
      if (error instanceof ValidationError || error instanceof AlreadyExistsError) {
        return { error: error.message };
      }
      throw error;
    }
    return redirect(`/admin/editions/${params.editionId}/categories`);
  }

  return { error: "Unknown action." };
}

export default function EditionCategories({ loaderData }: Route.ComponentProps) {
  const { edition, categories } = loaderData;
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";
  const error = actionData?.error ?? null;

  return (
    <div className="stack-8">
      <div className="stack-2">
        <h1 className="page-title">Registration categories</h1>
        <p>
          {edition.name}.{" "}
          <Link to={`/admin/editions/${edition.id}`} className="strong">
            Edit meeting
          </Link>
        </p>
      </div>

      {error ? (
        <p role="alert" className="cap-alert">
          {error}
        </p>
      ) : null}

      {categories.length === 0 ? (
        <p>No categories yet. Add the first below.</p>
      ) : (
        <div
          className="cap-table-wrap"
          role="region"
          aria-label="Registration categories"
          tabIndex={0}
        >
          <table className="cap-table">
            <thead>
              <tr>
                <th scope="col">Label</th>
                <th scope="col">Type</th>
                <th scope="col">Fee</th>
                <th scope="col">Active</th>
                <th scope="col" className="cell-end">
                  <span className="cap-sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => (
                <tr key={category.id}>
                  <td>{category.label}</td>
                  <td>{REGISTRATION_CATEGORY_KEY_LABELS[category.key]}</td>
                  <td>{formatMoney(category.amountCents, category.currency)}</td>
                  <td>{category.active ? "Yes" : "No"}</td>
                  <td className="cell-end">
                    <div className="cluster cluster-right">
                      <Link
                        to={`/admin/editions/${edition.id}/categories/${category.id}`}
                        className="strong"
                      >
                        Edit
                      </Link>
                      {category.active ? (
                        <Form method="post">
                          <input type="hidden" name="intent" value="deactivate" />
                          <input type="hidden" name="categoryId" value={category.id} />
                          <button type="submit" className="link-button strong cap-muted">
                            Deactivate
                          </button>
                        </Form>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className="card stack-4">
        <h2 className="subsection-title">Add a category</h2>
        <Form method="post" className="stack-4" noValidate>
          <input type="hidden" name="intent" value="create" />
          <div className="stack-1">
            <label htmlFor="key" className="cap-field-label">
              Type
            </label>
            <select id="key" name="key" defaultValue="member" className="cap-select">
              {REGISTRATION_CATEGORY_KEYS.map((key) => (
                <option key={key} value={key}>
                  {REGISTRATION_CATEGORY_KEY_LABELS[key]}
                </option>
              ))}
            </select>
          </div>
          <div className="stack-1">
            <label htmlFor="label" className="cap-field-label">
              Label
            </label>
            <input
              id="label"
              name="label"
              type="text"
              required
              placeholder="ASM Member"
              className="cap-input"
            />
          </div>
          <div className="stack-1">
            <label htmlFor="fee" className="cap-field-label">
              Fee (dollars)
            </label>
            <input
              id="fee"
              name="fee"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              required
              placeholder="45.00"
              className="cap-input"
            />
          </div>
          <div className="stack-1">
            <label htmlFor="currency" className="cap-field-label">
              Currency
            </label>
            <input
              id="currency"
              name="currency"
              type="text"
              defaultValue="USD"
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
