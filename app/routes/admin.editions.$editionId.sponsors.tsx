import { Form, Link, redirect, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/admin.editions.$editionId.sponsors";
import { cloudflareContext } from "~/load-context";
import { requireChair } from "~/lib/auth.server";
import {
  NotFoundError,
  ValidationError,
  getDataAccess,
} from "~/lib/data-access";
import { SPONSOR_TIERS } from "~/lib/vocab";

export function meta(_args: Route.MetaArgs) {
  return [{ title: "Sponsors | Texas Branch ASM" }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { actor } = await requireChair(request, params.editionId);
  const { env } = context.get(cloudflareContext);
  const da = getDataAccess(env);
  const edition = await da.editions.getById(actor, params.editionId);
  const sponsors = await da.sponsors.listForEdition(actor, params.editionId);
  return { edition: { id: edition.id, name: edition.name }, sponsors };
}

function parseSortOrder(value: FormDataEntryValue | null): number {
  const raw = String(value ?? "0").trim() || "0";
  const n = Number(raw);
  if (!Number.isInteger(n)) {
    throw new ValidationError("Sort order must be a whole number.");
  }
  return n;
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const { actor } = await requireChair(request, params.editionId);
  const da = getDataAccess(context.get(cloudflareContext).env);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const back = `/admin/editions/${params.editionId}/sponsors`;

  try {
    if (intent === "remove") {
      const id = String(form.get("sponsorId") ?? "");
      if (id) await da.sponsors.remove(actor, id);
      return redirect(back);
    }

    if (intent === "create") {
      await da.sponsors.create(actor, {
        editionId: params.editionId,
        name: String(form.get("name") ?? ""),
        tier: String(form.get("tier") ?? ""),
        url: String(form.get("url") ?? ""),
        sortOrder: parseSortOrder(form.get("sortOrder")),
      });
      return redirect(back);
    }

    if (intent === "update") {
      await da.sponsors.update(actor, String(form.get("sponsorId") ?? ""), {
        name: String(form.get("name") ?? ""),
        tier: String(form.get("tier") ?? ""),
        url: String(form.get("url") ?? ""),
        sortOrder: parseSortOrder(form.get("sortOrder")),
      });
      return redirect(back);
    }
  } catch (error) {
    if (error instanceof ValidationError || error instanceof NotFoundError) {
      return { error: error.message };
    }
    throw error;
  }

  return { error: "Unknown action." };
}

const inputClass =
  "w-full rounded border border-gray-300 px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-gray-700 dark:bg-gray-900";

const smallButton =
  "rounded border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-gray-700 dark:hover:bg-gray-900";

type Sponsor = Route.ComponentProps["loaderData"]["sponsors"][number];

function SponsorFields({ sponsor }: { sponsor?: Sponsor }) {
  const idBase = sponsor ? sponsor.id : "new";
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="space-y-1 sm:col-span-2">
        <label htmlFor={`name-${idBase}`} className="block text-sm font-medium">
          Name
        </label>
        <input
          id={`name-${idBase}`}
          name="name"
          type="text"
          required
          defaultValue={sponsor?.name ?? ""}
          placeholder="Acme Biosciences"
          className={inputClass}
        />
      </div>
      <div className="space-y-1">
        <label htmlFor={`tier-${idBase}`} className="block text-sm font-medium">
          Tier
        </label>
        <input
          id={`tier-${idBase}`}
          name="tier"
          type="text"
          list={`tiers-${idBase}`}
          defaultValue={sponsor?.tier ?? ""}
          placeholder="Gold"
          className={inputClass}
        />
        <datalist id={`tiers-${idBase}`}>
          {SPONSOR_TIERS.map((tier) => (
            <option key={tier} value={tier} />
          ))}
        </datalist>
      </div>
      <div className="space-y-1">
        <label htmlFor={`sort-${idBase}`} className="block text-sm font-medium">
          Sort order
        </label>
        <input
          id={`sort-${idBase}`}
          name="sortOrder"
          type="number"
          step="1"
          defaultValue={sponsor?.sortOrder ?? 0}
          className={inputClass}
        />
      </div>
      <div className="space-y-1 sm:col-span-2">
        <label htmlFor={`url-${idBase}`} className="block text-sm font-medium">
          Website
        </label>
        <input
          id={`url-${idBase}`}
          name="url"
          type="url"
          defaultValue={sponsor?.url ?? ""}
          placeholder="https://example.com"
          className={inputClass}
        />
      </div>
    </div>
  );
}

export default function Sponsors({ loaderData }: Route.ComponentProps) {
  const { edition, sponsors } = loaderData;
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";
  const error = actionData?.error ?? null;

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Sponsors</h1>
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
          Sponsors show on the public program. Logo upload comes later.
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

      {sponsors.length === 0 ? (
        <p className="text-gray-700 dark:text-gray-300">
          No sponsors yet. Add the first below.
        </p>
      ) : (
        <ul className="space-y-4">
          {sponsors.map((sponsor) => (
            <li
              key={sponsor.id}
              className="space-y-3 rounded border border-gray-200 p-4 dark:border-gray-800"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{sponsor.name}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {[sponsor.tier ?? "", sponsor.url ?? ""]
                      .filter((p) => p.length > 0)
                      .join(" . ")}
                  </p>
                </div>
                <Form method="post">
                  <input type="hidden" name="intent" value="remove" />
                  <input type="hidden" name="sponsorId" value={sponsor.id} />
                  <button
                    type="submit"
                    onClick={(e) => {
                      if (!window.confirm(`Remove ${sponsor.name}?`)) {
                        e.preventDefault();
                      }
                    }}
                    className="text-sm font-medium text-red-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 dark:text-red-400"
                  >
                    Remove
                  </button>
                </Form>
              </div>

              <details className="rounded border border-gray-100 p-3 dark:border-gray-900">
                <summary className="cursor-pointer text-sm font-medium">
                  Edit sponsor
                </summary>
                <Form method="post" className="mt-3 space-y-3" noValidate>
                  <input type="hidden" name="intent" value="update" />
                  <input type="hidden" name="sponsorId" value={sponsor.id} />
                  <SponsorFields sponsor={sponsor} />
                  <button type="submit" disabled={submitting} className={smallButton}>
                    Save sponsor
                  </button>
                </Form>
              </details>
            </li>
          ))}
        </ul>
      )}

      <section className="space-y-4 rounded border border-gray-200 p-4 dark:border-gray-800">
        <h2 className="text-lg font-medium">Add a sponsor</h2>
        <Form method="post" className="space-y-4" noValidate>
          <input type="hidden" name="intent" value="create" />
          <SponsorFields />
          <button
            type="submit"
            disabled={submitting}
            className="rounded bg-blue-700 px-4 py-2 font-medium text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
          >
            {submitting ? "Adding..." : "Add sponsor"}
          </button>
        </Form>
      </section>
    </div>
  );
}
