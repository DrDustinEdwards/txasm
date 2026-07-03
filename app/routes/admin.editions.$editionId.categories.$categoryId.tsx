import { Form, Link, redirect, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/admin.editions.$editionId.categories.$categoryId";
import { cloudflareContext } from "~/load-context";
import { requireAdmin } from "~/lib/auth.server";
import {
  ValidationError,
  getDataAccess,
  type RegistrationCategoryPatch,
} from "~/lib/data-access";
import { centsToDollarsInput, parseDollarsToCents } from "~/lib/format";

export function meta(_args: Route.MetaArgs) {
  return [{ title: "Edit category | Texas Branch ASM" }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { actor } = await requireAdmin(request);
  const { env } = context.get(cloudflareContext);
  const da = getDataAccess(env);
  const categories = await da.registrationCategories.listForEdition(
    actor,
    params.editionId,
  );
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
    await getDataAccess(env).registrationCategories.update(
      actor,
      params.categoryId,
      patch,
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      return { error: error.message };
    }
    throw error;
  }

  return redirect(`/admin/editions/${params.editionId}/categories`);
}

const inputClass =
  "w-full rounded border border-gray-300 px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-gray-700 dark:bg-gray-900";

export default function EditCategory({ loaderData }: Route.ComponentProps) {
  const { editionId, category } = loaderData;
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";
  const error = actionData?.error ?? null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Edit category</h1>
        <p className="text-gray-700 dark:text-gray-300">
          Type: {category.key}
        </p>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        >
          {error}
        </p>
      ) : null}

      <Form method="post" className="space-y-4" noValidate>
        <div className="space-y-1">
          <label htmlFor="label" className="block text-sm font-medium">
            Label
          </label>
          <input
            id="label"
            name="label"
            type="text"
            required
            defaultValue={category.label}
            className={inputClass}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="fee" className="block text-sm font-medium">
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
            className={inputClass}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="currency" className="block text-sm font-medium">
            Currency
          </label>
          <input
            id="currency"
            name="currency"
            type="text"
            defaultValue={category.currency.toUpperCase()}
            className={inputClass}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="sortOrder" className="block text-sm font-medium">
            Sort order
          </label>
          <input
            id="sortOrder"
            name="sortOrder"
            type="number"
            step="1"
            defaultValue={category.sortOrder}
            className={inputClass}
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            id="active"
            name="active"
            type="checkbox"
            defaultChecked={category.active}
            className="h-4 w-4"
          />
          <label htmlFor="active" className="text-sm font-medium">
            Active
          </label>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-primary px-4 py-2 font-medium text-on-primary hover:opacity-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-60"
          >
            {submitting ? "Saving..." : "Save changes"}
          </button>
          <Link
            to={`/admin/editions/${editionId}/categories`}
            className="text-sm font-medium text-text-muted hover:underline"
          >
            Cancel
          </Link>
        </div>
      </Form>
    </div>
  );
}
