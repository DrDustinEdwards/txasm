import { Form, redirect, useActionData, useNavigation } from "react-router";
import { Link } from "capsomer/react/link";
import type { Route } from "./+types/admin.editions.$editionId.roles";
import { pageTitle } from "~/lib/site-meta";
import { privateMeta } from "@drdustinedwards/site-helpers/head";
import { cloudflareContext } from "@dustinedwards/site-runtime/context";
import { requireAdmin } from "~/lib/auth.server";
import {
  NotFoundError,
  ValidationError,
  getDataAccess,
  type GrantableRole,
} from "~/lib/data-access";
import { readForm } from "@dustinedwards/site-runtime/body";
import { FORM_LIMIT } from "~/lib/form.server";

export function meta({ matches }: Route.MetaArgs) {
  return privateMeta(pageTitle(matches, "Chairs and reviewers"));
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
  const form = await readForm(request, FORM_LIMIT);
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

export default function EditionRoles({ loaderData }: Route.ComponentProps) {
  const { edition, grants } = loaderData;
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";
  const error = actionData?.error ?? null;

  const chairs = grants.filter((g) => g.role === "chair");
  const reviewers = grants.filter((g) => g.role === "reviewer");

  return (
    <div className="cap-stack" data-gap="7">
      <div className="cap-stack" data-gap="3">
        <h1 className="page-title">Chairs and reviewers</h1>
        <p>
          {edition.name}.{" "}
          <Link to={`/admin/editions/${edition.id}`} className="strong">
            Edit meeting
          </Link>
        </p>
        <p className="cap-muted">
          Grant a role by email. The person must have signed in at least once so their account
          exists. Roles apply to this meeting only.
        </p>
      </div>

      {error ? (
        <p role="alert" className="cap-alert">
          {error}
        </p>
      ) : null}

      <RoleList title="Chairs" empty="No chairs yet." grants={chairs} />
      <RoleList title="Reviewers" empty="No reviewers yet." grants={reviewers} />

      <section className="card cap-stack">
        <h2 className="subsection-title">Add a chair or reviewer</h2>
        <Form method="post" className="cap-stack" noValidate>
          <input type="hidden" name="intent" value="grant" />
          <div className="cap-stack" data-gap="2">
            <label htmlFor="email" className="cap-field-label">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="off"
              placeholder="person@university.edu"
              className="cap-input"
            />
          </div>
          <div className="cap-stack" data-gap="2">
            <label htmlFor="role" className="cap-field-label">
              Role
            </label>
            <select id="role" name="role" defaultValue="reviewer" className="cap-select">
              <option value="reviewer">Reviewer</option>
              <option value="chair">Chair</option>
            </select>
          </div>
          <button type="submit" disabled={submitting} className="cap-btn" data-variant="primary">
            {submitting ? "Adding..." : "Add role"}
          </button>
        </Form>
      </section>
    </div>
  );
}

function RoleList({
  title,
  empty,
  grants,
}: {
  title: string;
  empty: string;
  grants: Array<{ userId: string; role: string; name: string | null; email: string }>;
}) {
  return (
    <section className="cap-stack" data-gap="4">
      <h2 className="subsection-title">{title}</h2>
      {grants.length === 0 ? (
        <p>{empty}</p>
      ) : (
        <ul className="cap-stack" data-gap="3">
          {grants.map((grant) => (
            <li key={`${grant.userId}-${grant.role}`} className="card card-s cap-spread">
              <span className="small">
                <span className="strong">{grant.name || grant.email}</span>
                {grant.name ? <span className="cap-muted"> {grant.email}</span> : null}
              </span>
              <Form method="post">
                <input type="hidden" name="intent" value="revoke" />
                <input type="hidden" name="userId" value={grant.userId} />
                <input type="hidden" name="role" value={grant.role} />
                <button type="submit" className="link-button small strong">
                  Remove{" "}
                  <span className="cap-sr-only">
                    {roleLabel(grant.role)} {grant.email}
                  </span>
                </button>
              </Form>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
