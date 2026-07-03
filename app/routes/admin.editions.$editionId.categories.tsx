import { Form, Link, redirect, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/admin.editions.$editionId.categories";
import { cloudflareContext } from "~/load-context";
import { requireAdmin } from "~/lib/auth.server";
import {
  AlreadyExistsError,
  ValidationError,
  getDataAccess,
} from "~/lib/data-access";
import {
  REGISTRATION_CATEGORY_KEYS,
  REGISTRATION_CATEGORY_KEY_LABELS,
  type RegistrationCategoryKey,
} from "~/lib/vocab";
import { formatMoney, parseDollarsToCents } from "~/lib/format";

export function meta(_args: Route.MetaArgs) {
  return [{ title: "Registration categories | Texas Branch ASM" }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { actor } = await requireAdmin(request);
  const { env } = context.get(cloudflareContext);
  const da = getDataAccess(env);
  const edition = await da.editions.getById(actor, params.editionId);
  const categories = await da.registrationCategories.listForEdition(
    actor,
    params.editionId,
  );
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

    if (
      !(REGISTRATION_CATEGORY_KEYS as readonly string[]).includes(key)
    ) {
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

const inputClass =
  "w-full rounded border border-gray-300 px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-gray-700 dark:bg-gray-900";

export default function EditionCategories({ loaderData }: Route.ComponentProps) {
  const { edition, categories } = loaderData;
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";
  const error = actionData?.error ?? null;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Registration categories</h1>
        <p className="text-gray-700 dark:text-gray-300">
          {edition.name}.{" "}
          <Link
            to={`/admin/editions/${edition.id}`}
            className="font-medium text-blue-700 hover:underline dark:text-blue-400"
          >
            Edit meeting
          </Link>
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

      {categories.length === 0 ? (
        <p className="text-gray-700 dark:text-gray-300">
          No categories yet. Add the first below.
        </p>
      ) : (
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-800">
              <th scope="col" className="py-2 pr-4 font-medium">
                Label
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                Type
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                Fee
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                Active
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {categories.map((category) => (
              <tr
                key={category.id}
                className="border-b border-gray-100 dark:border-gray-900"
              >
                <td className="py-2 pr-4">{category.label}</td>
                <td className="py-2 pr-4">
                  {REGISTRATION_CATEGORY_KEY_LABELS[category.key]}
                </td>
                <td className="py-2 pr-4">
                  {formatMoney(category.amountCents, category.currency)}
                </td>
                <td className="py-2 pr-4">{category.active ? "Yes" : "No"}</td>
                <td className="py-2 text-right">
                  <div className="flex items-center justify-end gap-3">
                    <Link
                      to={`/admin/editions/${edition.id}/categories/${category.id}`}
                      className="font-medium text-blue-700 hover:underline dark:text-blue-400"
                    >
                      Edit
                    </Link>
                    {category.active ? (
                      <Form method="post">
                        <input type="hidden" name="intent" value="deactivate" />
                        <input
                          type="hidden"
                          name="categoryId"
                          value={category.id}
                        />
                        <button
                          type="submit"
                          className="font-medium text-text-muted hover:underline"
                        >
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
      )}

      <section className="space-y-4 rounded border border-gray-200 p-4 dark:border-gray-800">
        <h2 className="text-lg font-medium">Add a category</h2>
        <Form method="post" className="space-y-4" noValidate>
          <input type="hidden" name="intent" value="create" />
          <div className="space-y-1">
            <label htmlFor="key" className="block text-sm font-medium">
              Type
            </label>
            <select id="key" name="key" defaultValue="member" className={inputClass}>
              {REGISTRATION_CATEGORY_KEYS.map((key) => (
                <option key={key} value={key}>
                  {REGISTRATION_CATEGORY_KEY_LABELS[key]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="label" className="block text-sm font-medium">
              Label
            </label>
            <input
              id="label"
              name="label"
              type="text"
              required
              placeholder="ASM Member"
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
              placeholder="45.00"
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
              defaultValue="USD"
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
              defaultValue={0}
              className={inputClass}
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-primary px-4 py-2 font-medium text-on-primary hover:opacity-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-60"
          >
            {submitting ? "Adding..." : "Add category"}
          </button>
        </Form>
      </section>
    </div>
  );
}
