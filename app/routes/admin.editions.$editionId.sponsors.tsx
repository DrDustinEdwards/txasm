import { Form, redirect, useActionData, useNavigation } from "react-router";
import { Panel } from "capsomer/react/panel";
import { Disclosure } from "capsomer/react/disclosure";
import { Link } from "capsomer/react/link";
import type { Route } from "./+types/admin.editions.$editionId.sponsors";
import { pageTitle } from "~/lib/site-meta";
import { privateMeta } from "@drdustinedwards/site-helpers/head";
import { cloudflareContext } from "@dustinedwards/site-runtime/context";
import { requireChair } from "~/lib/auth.server";
import { NotFoundError, ValidationError, getDataAccess } from "~/lib/data-access";
import { SPONSOR_TIERS } from "~/lib/vocab";
import { readForm } from "@dustinedwards/site-runtime/body";
import { parseSortOrder, FORM_LIMIT } from "~/lib/form.server";
import { confirmSubmit } from "capsomer/behavior/confirm-dialog";

export function meta({ matches }: Route.MetaArgs) {
  return privateMeta(pageTitle(matches, "Sponsors"));
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { actor } = await requireChair(request, params.editionId);
  const { env } = context.get(cloudflareContext);
  const da = getDataAccess(env);
  const edition = await da.editions.getById(actor, params.editionId);
  const sponsors = await da.sponsors.listForEdition(actor, params.editionId);
  return { edition: { id: edition.id, name: edition.name }, sponsors };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const { actor } = await requireChair(request, params.editionId);
  const da = getDataAccess(context.get(cloudflareContext).env);
  const form = await readForm(request, FORM_LIMIT);
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

type Sponsor = Route.ComponentProps["loaderData"]["sponsors"][number];

function SponsorFields({ sponsor }: { sponsor?: Sponsor }) {
  const idBase = sponsor ? sponsor.id : "new";
  return (
    <div className="cap-grid" data-cols="2">
      <div className="cap-stack span-2" data-gap="2">
        <label htmlFor={`name-${idBase}`} className="cap-field-label">
          Name
        </label>
        <input
          id={`name-${idBase}`}
          name="name"
          type="text"
          required
          defaultValue={sponsor?.name ?? ""}
          placeholder="Acme Biosciences"
          className="cap-input"
        />
      </div>
      <div className="cap-stack" data-gap="2">
        <label htmlFor={`tier-${idBase}`} className="cap-field-label">
          Tier
        </label>
        <input
          id={`tier-${idBase}`}
          name="tier"
          type="text"
          list={`tiers-${idBase}`}
          defaultValue={sponsor?.tier ?? ""}
          placeholder="Gold"
          className="cap-input"
        />
        <datalist id={`tiers-${idBase}`}>
          {SPONSOR_TIERS.map((tier) => (
            <option key={tier} value={tier} />
          ))}
        </datalist>
      </div>
      <div className="cap-stack" data-gap="2">
        <label htmlFor={`sort-${idBase}`} className="cap-field-label">
          Sort order
        </label>
        <input
          id={`sort-${idBase}`}
          name="sortOrder"
          type="number"
          step="1"
          defaultValue={sponsor?.sortOrder ?? 0}
          className="cap-input"
        />
      </div>
      <div className="cap-stack span-2" data-gap="2">
        <label htmlFor={`url-${idBase}`} className="cap-field-label">
          Website
        </label>
        <input
          id={`url-${idBase}`}
          name="url"
          type="url"
          defaultValue={sponsor?.url ?? ""}
          placeholder="https://example.com"
          className="cap-input"
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
    <div className="cap-stack" data-gap="7">
      <div className="cap-stack" data-gap="3">
        <h1 className="page-title">Sponsors</h1>
        <p>
          {edition.name}.{" "}
          <Link to={`/admin/editions/${edition.id}`} className="strong">
            Edit meeting
          </Link>
        </p>
        <p className="cap-muted">Sponsors show on the public program. Logo upload comes later.</p>
      </div>

      {error ? (
        <p role="alert" className="cap-alert">
          {error}
        </p>
      ) : null}

      {sponsors.length === 0 ? (
        <p>No sponsors yet. Add the first below.</p>
      ) : (
        <ul className="cap-stack">
          {sponsors.map((sponsor) => (
            <li key={sponsor.id} className="cap-panel">
              <div className="cap-panel-body cap-stack" data-gap="4">
                <div className="cap-spread">
                  <div>
                    <p className="strong">{sponsor.name}</p>
                    <p className="small cap-muted">
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
                      onClick={(e) =>
                        confirmSubmit(e, {
                          title: `Remove ${sponsor.name}?`,
                          action: "Remove sponsor",
                        })
                      }
                      className="small strong"
                    >
                      Remove
                    </button>
                  </Form>
                </div>

                <Disclosure summary="Edit sponsor" variant="card" size="sm" marker="triangle">
                  <Form method="post" className="cap-stack" data-gap="4" noValidate>
                    <input type="hidden" name="intent" value="update" />
                    <input type="hidden" name="sponsorId" value={sponsor.id} />
                    <SponsorFields sponsor={sponsor} />
                    <button type="submit" disabled={submitting} className="cap-btn" data-size="sm">
                      Save sponsor
                    </button>
                  </Form>
                </Disclosure>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Panel title="Add a sponsor">
        <Form method="post" className="cap-stack" noValidate>
          <input type="hidden" name="intent" value="create" />
          <SponsorFields />
          <button type="submit" disabled={submitting} className="cap-btn" data-variant="primary">
            {submitting ? "Adding..." : "Add sponsor"}
          </button>
        </Form>
      </Panel>
    </div>
  );
}
