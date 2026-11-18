import { Stack } from "capsomer/react/stack";
import { TextField } from "capsomer/react/field";
import { Form, redirect, useActionData, useNavigation } from "react-router";
import { Panel } from "capsomer/react/panel";
import { Disclosure } from "capsomer/react/disclosure";
import { EditionPageHead } from "~/components/edition-page-head";
import type { Route } from "./+types/admin.editions.$editionId.sponsors";
import { pageTitle } from "~/lib/site-meta";
import { privateMeta } from "@drdustinedwards/site-helpers/head";
import { cloudflareContext } from "@dustinedwards/site-runtime/context";
import { requireChair, requireChairEdition } from "~/lib/auth.server";
import { NotFoundError, ValidationError, getDataAccess } from "~/lib/data-access";
import { SPONSOR_TIERS } from "~/lib/vocab";
import { readForm } from "@dustinedwards/site-runtime/body";
import { parseSortOrder, FORM_LIMIT } from "~/lib/form.server";
import { confirmSubmit } from "capsomer/behavior/confirm-dialog";

export function meta({ matches }: Route.MetaArgs) {
  return privateMeta(pageTitle(matches, "Sponsors"));
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { actor, da, edition } = await requireChairEdition(request, params.editionId);
  const sponsors = await da.sponsors.listForEdition(actor, params.editionId);
  return { edition, sponsors };
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
      <div className="span-2">
        <TextField
          id={`name-${idBase}`}
          label="Name"
          name="name"
          type="text"
          required
          defaultValue={sponsor?.name ?? ""}
          placeholder="Acme Biosciences"
        />
      </div>
      <Stack gap={2}>
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
      </Stack>
      <TextField
        id={`sort-${idBase}`}
        label="Sort order"
        name="sortOrder"
        type="number"
        step="1"
        defaultValue={sponsor?.sortOrder ?? 0}
      />
      <div className="span-2">
        <TextField
          id={`url-${idBase}`}
          label="Website"
          name="url"
          type="url"
          defaultValue={sponsor?.url ?? ""}
          placeholder="https://example.com"
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
    <Stack gap={7}>
      <EditionPageHead title="Sponsors" edition={edition}>
        <p className="cap-muted">Sponsors show on the public program.</p>
      </EditionPageHead>

      {error ? (
        <p role="alert" className="cap-alert">
          {error}
        </p>
      ) : null}

      {sponsors.length === 0 ? (
        <p>No sponsors yet.</p>
      ) : (
        <Stack as="ul">
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
                  <Stack as={Form} method="post" noValidate gap={4}>
                    <input type="hidden" name="intent" value="update" />
                    <input type="hidden" name="sponsorId" value={sponsor.id} />
                    <SponsorFields sponsor={sponsor} />
                    <button type="submit" disabled={submitting} className="cap-btn" data-size="sm">
                      Save sponsor
                    </button>
                  </Stack>
                </Disclosure>
              </div>
            </li>
          ))}
        </Stack>
      )}

      <Panel title="Add a sponsor">
        <Stack as={Form} method="post" noValidate>
          <input type="hidden" name="intent" value="create" />
          <SponsorFields />
          <button type="submit" disabled={submitting} className="cap-btn" data-variant="primary">
            {submitting ? "Adding..." : "Add sponsor"}
          </button>
        </Stack>
      </Panel>
    </Stack>
  );
}
