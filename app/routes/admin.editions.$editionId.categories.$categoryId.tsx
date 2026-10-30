import { Form, redirect, useActionData, useNavigation } from "react-router";
import { Link } from "capsomer/react/link";
import type { Route } from "./+types/admin.editions.$editionId.categories.$categoryId";
import { privateMeta } from "~/lib/site-meta";
import { cloudflareContext } from "~/load-context";
import { requireAdmin } from "~/lib/auth.server";
import { ValidationError, getDataAccess, type RegistrationCategoryPatch } from "~/lib/data-access";
import { centsToDollarsInput, parseDollarsToCents } from "~/lib/format";

export function meta({ matches }: Route.MetaArgs) {
  return privateMeta(matches, "Edit category");
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { actor } = await requireAdmin(request);
  const { env } = context.get(cloudflareContext);
  const da = getDataAccess(env);
  const categories = await da.registrationCategories.listForEdition(actor, params.editionId);
  const category = categories.find((row) => row.id === params.categoryId);
  if (!category) throw new Response("Not found", { status: 404 });
  return { editionId: params.editionId, category };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const { actor } = await requireAdmin(request);
  const form = await request.formData();

  const label = String(form.get("label") ?? "").trim();
  const currency = String(form.get("currency") ?? "usd");
  const sortOrder = Number(String(form.get("sortOrder") ?? "0").trim() || "0");
  const active = form.get("active") != null;
  const amountCents = parseDollarsToCents(String(form.get("fee") ?? ""));

  if (amountCents === null) {
    return { error: "Enter a fee of zero or more dollars." };
  }
  if (!Number.isInteger(sortOrder)) {
    return { error: "Sort order must be a whole number." };
  }

  const patch: RegistrationCategoryPatch = {
    label,
    amountCents,
    currency,
    sortOrder,
    active,
  };

  try {
    const { env } = context.get(cloudflareContext);
    await getDataAccess(env).registrationCategories.update(actor, params.categoryId, patch);
  } catch (error) {
    if (error instanceof ValidationError) {
      return { error: error.message };
    }
    throw error;
  }

  return redirect(`/admin/editions/${params.editionId}/categories`);
}

export default function EditCategory({ loaderData }: Route.ComponentProps) {
  const { editionId, category } = loaderData;
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";
  const error = actionData?.error ?? null;

  return (
    <div className="form-page stack-6">
      <div className="stack-1">
        <h1 className="page-title">Edit category</h1>
        <p>Type: {category.key}</p>
      </div>

      {error ? (
        <p role="alert" className="cap-alert">
          {error}
        </p>
      ) : null}

      <Form method="post" className="stack-4" noValidate>
        <div className="stack-1">
          <label htmlFor="label" className="cap-field-label">
            Label
          </label>
          <input
            id="label"
            name="label"
            type="text"
            required
            defaultValue={category.label}
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
            defaultValue={centsToDollarsInput(category.amountCents)}
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
            defaultValue={category.currency.toUpperCase()}
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
            defaultValue={category.sortOrder}
            className="cap-input"
          />
        </div>
        <div className="cluster">
          <input id="active" name="active" type="checkbox" defaultChecked={category.active} />
          <label htmlFor="active" className="small strong">
            Active
          </label>
        </div>

        <div className="cluster">
          <button type="submit" disabled={submitting} className="cap-btn" data-variant="primary">
            {submitting ? "Saving..." : "Save changes"}
          </button>
          <Link to={`/admin/editions/${editionId}/categories`} className="small strong cap-muted">
            Cancel
          </Link>
        </div>
      </Form>
    </div>
  );
}
