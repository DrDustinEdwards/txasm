import { Form, Link, redirect, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/admin.editions.$editionId.abstract-categories";
import { cloudflareContext } from "~/load-context";
import { requireAdmin } from "~/lib/auth.server";
import {
  AlreadyExistsError,
  ValidationError,
  getDataAccess,
} from "~/lib/data-access";

export function meta(_args: Route.MetaArgs) {
  return [{ title: "Abstract categories | Texas Branch ASM" }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { actor } = await requireAdmin(request);
  const { env } = context.get(cloudflareContext);
  const da = getDataAccess(env);
  const edition = await da.editions.getById(actor, params.editionId);
  const categories = await da.abstractCategories.listForEdition(
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

const inputClass =
  "w-full rounded border border-gray-300 px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-gray-700 dark:bg-gray-900";

export default function AbstractCategories({
  loaderData,
}: Route.ComponentProps) {
  const { edition, categories } = loaderData;
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";
  const error = actionData?.error ?? null;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Abstract categories</h1>
        <p className="text-gray-700 dark:text-gray-300">
          {edition.name}.{" "}
          <Link
            to={`/admin/editions/${edition.id}`}
            className="font-medium text-blue-700 hover:underline dark:text-blue-400"
          >
            Edit meeting
          </Link>
        </p>
        <p className="text-gray-600 dark:text-gray-400">
          Authors choose one of these when they submit an abstract.
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
        <ul className="space-y-3">
          {categories.map((category) => (
            <li
              key={category.id}
              className="rounded border border-gray-200 p-3 dark:border-gray-800"
            >
              <Form
                method="post"
                className="flex flex-wrap items-end gap-3"
              >
                <input type="hidden" name="intent" value="update" />
                <input type="hidden" name="categoryId" value={category.id} />
                <div className="flex-1 space-y-1">
                  <label
                    htmlFor={`name-${category.id}`}
                    className="block text-sm font-medium"
                  >
                    Name
                  </label>
                  <input
                    id={`name-${category.id}`}
                    name="name"
                    type="text"
                    defaultValue={category.name}
                    required
                    className={inputClass}
                  />
                </div>
                <div className="w-24 space-y-1">
                  <label
                    htmlFor={`sort-${category.id}`}
                    className="block text-sm font-medium"
                  >
                    Sort
                  </label>
                  <input
                    id={`sort-${category.id}`}
                    name="sortOrder"
                    type="number"
                    step="1"
                    defaultValue={category.sortOrder}
                    className={inputClass}
                  />
                </div>
                <button
                  type="submit"
                  className="rounded-md border border-border px-3 py-2 text-sm font-medium text-text hover:bg-panel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  Save
                </button>
              </Form>
              <Form method="post" className="mt-2">
                <input type="hidden" name="intent" value="remove" />
                <input type="hidden" name="categoryId" value={category.id} />
                <button
                  type="submit"
                  className="text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  Remove
                </button>
              </Form>
            </li>
          ))}
        </ul>
      )}

      <section className="space-y-4 rounded border border-gray-200 p-4 dark:border-gray-800">
        <h2 className="text-lg font-medium">Add a category</h2>
        <Form method="post" className="space-y-4" noValidate>
          <input type="hidden" name="intent" value="create" />
          <div className="space-y-1">
            <label htmlFor="name" className="block text-sm font-medium">
              Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              placeholder="Environmental Microbiology"
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
