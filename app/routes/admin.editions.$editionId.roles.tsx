import { Form, Link, redirect, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/admin.editions.$editionId.roles";
import { cloudflareContext } from "~/load-context";
import { requireAdmin } from "~/lib/auth.server";
import {
  NotFoundError,
  ValidationError,
  getDataAccess,
  type GrantableRole,
} from "~/lib/data-access";

export function meta(_args: Route.MetaArgs) {
  return [{ title: "Chairs and reviewers | Texas Branch ASM" }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { actor } = await requireAdmin(request);
  const { env } = context.get(cloudflareContext);
  const da = getDataAccess(env);
  const edition = await da.editions.getById(actor, params.editionId);
  const grants = await da.roles.listForEdition(actor, params.editionId);
  return { edition, grants };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const { actor } = await requireAdmin(request);
  const da = getDataAccess(context.get(cloudflareContext).env);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const back = `/admin/editions/${params.editionId}/roles`;

  try {
    if (intent === "revoke") {
      const userId = String(form.get("userId") ?? "");
      const role = String(form.get("role") ?? "");
      if (userId && (role === "chair" || role === "reviewer")) {
        await da.roles.revoke(actor, {
          editionId: params.editionId,
          userId,
          role,
        });
      }
      return redirect(back);
    }

    if (intent === "grant") {
      const email = String(form.get("email") ?? "");
      const role = String(form.get("role") ?? "");
      if (role !== "chair" && role !== "reviewer") {
        return { error: "Choose chair or reviewer." };
      }
      await da.roles.grant(actor, {
        editionId: params.editionId,
        email,
        role: role as GrantableRole,
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

function roleLabel(role: string) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

const inputClass =
  "w-full rounded border border-gray-300 px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-gray-700 dark:bg-gray-900";

export default function EditionRoles({ loaderData }: Route.ComponentProps) {
  const { edition, grants } = loaderData;
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";
  const error = actionData?.error ?? null;

  const chairs = grants.filter((g) => g.role === "chair");
  const reviewers = grants.filter((g) => g.role === "reviewer");

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Chairs and reviewers</h1>
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
          Grant a role by email. The person must have signed in at least once so
          their account exists. Roles apply to this meeting only.
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

      <RoleList
        title="Chairs"
        editionId={edition.id}
        empty="No chairs yet."
        grants={chairs}
      />
      <RoleList
        title="Reviewers"
        editionId={edition.id}
        empty="No reviewers yet."
        grants={reviewers}
      />

      <section className="space-y-4 rounded border border-gray-200 p-4 dark:border-gray-800">
        <h2 className="text-lg font-medium">Add a chair or reviewer</h2>
        <Form method="post" className="space-y-4" noValidate>
          <input type="hidden" name="intent" value="grant" />
          <div className="space-y-1">
            <label htmlFor="email" className="block text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="off"
              placeholder="person@university.edu"
              className={inputClass}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="role" className="block text-sm font-medium">
              Role
            </label>
            <select id="role" name="role" defaultValue="reviewer" className={inputClass}>
              <option value="reviewer">Reviewer</option>
              <option value="chair">Chair</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="rounded bg-blue-700 px-4 py-2 font-medium text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
          >
            {submitting ? "Adding..." : "Add role"}
          </button>
        </Form>
      </section>
    </div>
  );
}

function RoleList({
  title,
  editionId,
  empty,
  grants,
}: {
  title: string;
  editionId: string;
  empty: string;
  grants: Array<{ userId: string; role: string; name: string | null; email: string }>;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium">{title}</h2>
      {grants.length === 0 ? (
        <p className="text-gray-700 dark:text-gray-300">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {grants.map((grant) => (
            <li
              key={`${grant.userId}-${grant.role}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded border border-gray-200 p-3 dark:border-gray-800"
            >
              <span className="text-sm">
                <span className="font-medium">{grant.name || grant.email}</span>
                {grant.name ? (
                  <span className="text-gray-600 dark:text-gray-400">
                    {" "}
                    {grant.email}
                  </span>
                ) : null}
              </span>
              <Form method="post">
                <input type="hidden" name="intent" value="revoke" />
                <input type="hidden" name="userId" value={grant.userId} />
                <input type="hidden" name="role" value={grant.role} />
                <button
                  type="submit"
                  className="text-sm font-medium text-red-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 dark:text-red-400"
                >
                  Remove <span className="sr-only">{roleLabel(grant.role)} {grant.email}</span>
                </button>
              </Form>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
