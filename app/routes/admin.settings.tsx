import { useState } from "react";
import { Form, useActionData, useNavigation } from "react-router";
import { SchemaFields } from "capsomer/react/schema-form";
import { TextField } from "capsomer/react/field";
import { RepeaterField } from "capsomer/react/repeater-field";
import { rowsFromForm } from "capsomer/behavior/repeater-field";
import type { FieldSpec } from "capsomer/behavior/schema-form";
import { ActionResult } from "capsomer/react/message";
import { Panel } from "capsomer/react/panel";
import type { Route } from "./+types/admin.settings";
import { pageTitle } from "~/lib/site-meta";
import { privateMeta } from "@drdustinedwards/site-helpers/head";
import { cloudflareContext } from "@dustinedwards/site-runtime/context";
import { requireAdmin } from "~/lib/auth.server";
import {
  ValidationError,
  getDataAccess,
  type FooterLink,
  type PlatformSettingsPatch,
} from "~/lib/data-access";
import { readForm } from "@dustinedwards/site-runtime/body";
import { parseYear, FORM_LIMIT } from "~/lib/form.server";

export function meta({ matches }: Route.MetaArgs) {
  return privateMeta(pageTitle(matches, "Platform settings"));
}

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireAdmin(request);
  const { env } = context.get(cloudflareContext);
  const settings = await getDataAccess(env).settings.get();
  return { settings };
}

function parseWordLimit(value: FormDataEntryValue | null): number {
  const raw = String(value ?? "").trim();
  const n = Number(raw);
  if (!Number.isInteger(n)) {
    throw new ValidationError("The default word limit must be a whole number.");
  }
  return n;
}

function parseFooterLinks(form: FormData): FooterLink[] {
  const rows = rowsFromForm(form, "footerLinks", ["label", "url"]);
  if (!rows) throw new ValidationError("Could not read the footer links. Try again.");
  return rows.map(({ label, url }) => ({ label: label ?? "", url: url ?? "" }));
}

// The settings form's fields, by section. The action reads them itself (parseYear, parseWordLimit) so
// its messages stay in the admin's words; data-access validates and authorizes the write.
const IDENTITY: FieldSpec[] = [
  { key: "shortName", label: "Wordmark (short name)", kind: "text", placeholder: "TXASM" },
  { key: "orgName", label: "Display name", kind: "text", placeholder: "Texas Branch ASM" },
  { key: "orgFullName", label: "Full organization name", kind: "text", wide: true },
  { key: "tagline", label: "Tagline", kind: "text", wide: true },
  { key: "foundingYear", label: "Founding year", kind: "number" },
  { key: "contactEmail", label: "Contact email", kind: "email" },
  {
    key: "facebookUrl",
    label: "Facebook URL",
    kind: "url",
    wide: true,
    placeholder: "https://www.facebook.com/groups/...",
  },
];
const DEFAULTS: FieldSpec[] = [
  { key: "defaultCurrency", label: "Default currency", kind: "text", placeholder: "usd" },
  { key: "defaultAbstractWordLimit", label: "Default abstract word limit", kind: "number" },
];

export async function action({ request, context }: Route.ActionArgs) {
  const { actor } = await requireAdmin(request);
  const { env } = context.get(cloudflareContext);
  const form = await readForm(request, FORM_LIMIT);

  try {
    const patch: PlatformSettingsPatch = {
      orgName: String(form.get("orgName") ?? ""),
      shortName: String(form.get("shortName") ?? ""),
      orgFullName: String(form.get("orgFullName") ?? ""),
      tagline: String(form.get("tagline") ?? ""),
      foundingYear: parseYear(form.get("foundingYear"), "Founding year"),
      contactEmail: String(form.get("contactEmail") ?? ""),
      facebookUrl: String(form.get("facebookUrl") ?? ""),
      footerLinks: parseFooterLinks(form),
      defaultCurrency: String(form.get("defaultCurrency") ?? ""),
      defaultAbstractWordLimit: parseWordLimit(form.get("defaultAbstractWordLimit")),
    };
    await getDataAccess(env).settings.update(actor, patch);
  } catch (error) {
    if (error instanceof ValidationError) {
      return { error: error.message };
    }
    throw error;
  }

  return { ok: "Settings saved." };
}

export default function PlatformSettingsScreen({ loaderData }: Route.ComponentProps) {
  const { settings } = loaderData;
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";

  const [footerLinks, setFooterLinks] = useState<FooterLink[]>(() => settings.footerLinks);

  return (
    <div className="form-page cap-stack" data-gap="7">
      <div className="cap-stack" data-gap="3">
        <h1 className="page-title">Platform settings</h1>
        <p className="cap-muted">
          Organization identity and tunable defaults. These drive the site header, footer, and home
          page.
        </p>
      </div>

      <ActionResult data={actionData} />

      <Form method="post" className="cap-stack" data-gap="7" noValidate>
        <Panel title="Identity">
          <SchemaFields specs={IDENTITY} values={settings} />
        </Panel>

        <Panel title="Footer links">
          <RepeaterField
            legend="Footer links"
            rows={footerLinks}
            onChange={setFooterLinks}
            newRow={() => ({ label: "", url: "" })}
            rowLabel={(i) => `Link ${i + 1}`}
            addLabel="Add footer link"
            name="footerLinks"
            json
          >
            {(link, { set, name }) => (
              <>
                <TextField
                  label="Label"
                  name={name("label")}
                  value={link.label}
                  onChange={(e) => set({ label: e.target.value })}
                />
                <TextField
                  label="URL or path"
                  name={name("url")}
                  value={link.url}
                  onChange={(e) => set({ url: e.target.value })}
                  placeholder="/branch-officers"
                />
              </>
            )}
          </RepeaterField>
        </Panel>

        <Panel title="Defaults">
          <SchemaFields specs={DEFAULTS} values={settings} />
        </Panel>

        <button type="submit" disabled={submitting} className="cap-btn" data-variant="primary">
          {submitting ? "Saving..." : "Save settings"}
        </button>
      </Form>
    </div>
  );
}
