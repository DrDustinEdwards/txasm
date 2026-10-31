import { useEffect, useRef, useState } from "react";
import { Form, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/admin.settings";
import { privateMeta } from "~/lib/site-meta";
import { cloudflareContext } from "~/load-context";
import { requireAdmin } from "~/lib/auth.server";
import {
  ValidationError,
  getDataAccess,
  type FooterLink,
  type PlatformSettingsPatch,
} from "~/lib/data-access";
import { parseYear, readForm } from "~/lib/form.server";

export function meta({ matches }: Route.MetaArgs) {
  return privateMeta(matches, "Platform settings");
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

function parseFooterLinks(value: FormDataEntryValue | null): FooterLink[] {
  const raw = String(value ?? "[]");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ValidationError("Could not read the footer links. Try again.");
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.map((entry) => ({
    label: String((entry as Record<string, unknown>)?.label ?? ""),
    url: String((entry as Record<string, unknown>)?.url ?? ""),
  }));
}

export async function action({ request, context }: Route.ActionArgs) {
  const { actor } = await requireAdmin(request);
  const { env } = context.get(cloudflareContext);
  const form = await readForm(request);

  try {
    const patch: PlatformSettingsPatch = {
      orgName: String(form.get("orgName") ?? ""),
      shortName: String(form.get("shortName") ?? ""),
      orgFullName: String(form.get("orgFullName") ?? ""),
      tagline: String(form.get("tagline") ?? ""),
      foundingYear: parseYear(form.get("foundingYear"), "Founding year"),
      contactEmail: String(form.get("contactEmail") ?? ""),
      facebookUrl: String(form.get("facebookUrl") ?? ""),
      footerLinks: parseFooterLinks(form.get("footerLinks")),
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

function TextField({
  name,
  label,
  defaultValue,
  type = "text",
  placeholder,
}: {
  name: string;
  label: string;
  defaultValue: string;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="stack-1">
      <label htmlFor={name} className="cap-field-label">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="cap-input"
      />
    </div>
  );
}

export default function PlatformSettingsScreen({ loaderData }: Route.ComponentProps) {
  const { settings } = loaderData;
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";

  const [footerLinks, setFooterLinks] = useState<FooterLink[]>(() => settings.footerLinks);

  const statusRef = useRef<HTMLParagraphElement>(null);
  const error = actionData && "error" in actionData ? actionData.error : null;
  const ok = actionData && "ok" in actionData ? actionData.ok : null;
  useEffect(() => {
    if (actionData) statusRef.current?.focus();
  }, [actionData]);

  function updateLink(index: number, patch: Partial<FooterLink>) {
    setFooterLinks((prev) => prev.map((link, i) => (i === index ? { ...link, ...patch } : link)));
  }
  function addLink() {
    setFooterLinks((prev) => [...prev, { label: "", url: "" }]);
  }
  function removeLink(index: number) {
    setFooterLinks((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div className="form-page stack-8">
      <div className="stack-2">
        <h1 className="page-title">Platform settings</h1>
        <p className="cap-muted">
          Organization identity and tunable defaults. These drive the site header, footer, and home
          page.
        </p>
      </div>

      <p
        ref={statusRef}
        tabIndex={-1}
        role={error ? "alert" : "status"}
        className={error || ok ? "cap-alert" : "cap-sr-only"}
        data-tone={error ? "crit" : "ok"}
      >
        {typeof error === "string" ? error : typeof ok === "string" ? ok : ""}
      </p>

      <Form method="post" className="stack-8" noValidate>
        <fieldset className="card stack-4">
          <legend className="legend">Identity</legend>
          <div className="grid-2">
            <TextField
              name="shortName"
              label="Wordmark (short name)"
              defaultValue={settings.shortName}
              placeholder="TXASM"
            />
            <TextField
              name="orgName"
              label="Display name"
              defaultValue={settings.orgName}
              placeholder="Texas Branch ASM"
            />
          </div>
          <TextField
            name="orgFullName"
            label="Full organization name"
            defaultValue={settings.orgFullName}
          />
          <TextField name="tagline" label="Tagline" defaultValue={settings.tagline} />
          <div className="grid-2">
            <TextField
              name="foundingYear"
              label="Founding year"
              type="number"
              defaultValue={settings.foundingYear === null ? "" : String(settings.foundingYear)}
            />
            <TextField
              name="contactEmail"
              label="Contact email"
              type="email"
              defaultValue={settings.contactEmail ?? ""}
            />
          </div>
          <TextField
            name="facebookUrl"
            label="Facebook URL"
            type="url"
            defaultValue={settings.facebookUrl ?? ""}
            placeholder="https://www.facebook.com/groups/..."
          />
        </fieldset>

        <fieldset className="card stack-4">
          <legend className="legend">Footer links</legend>
          {footerLinks.length === 0 ? (
            <p className="small cap-muted">No footer links. Add one below.</p>
          ) : (
            <ol className="stack-3">
              {footerLinks.map((link, index) => (
                <li key={index} className="grid-pair-action">
                  <label className="stack-1">
                    <span className="cap-field-label">Label</span>
                    <input
                      type="text"
                      value={link.label}
                      onChange={(e) => updateLink(index, { label: e.target.value })}
                      className="cap-input"
                    />
                  </label>
                  <label className="stack-1">
                    <span className="cap-field-label">URL or path</span>
                    <input
                      type="text"
                      value={link.url}
                      onChange={(e) => updateLink(index, { url: e.target.value })}
                      placeholder="/branch-officers"
                      className="cap-input"
                    />
                  </label>
                  <button type="button" onClick={() => removeLink(index)} className="small strong">
                    Remove
                  </button>
                </li>
              ))}
            </ol>
          )}
          <button type="button" onClick={addLink} className="cap-btn" data-size="sm">
            Add footer link
          </button>
          <input type="hidden" name="footerLinks" value={JSON.stringify(footerLinks)} />
        </fieldset>

        <fieldset className="card stack-4">
          <legend className="legend">Defaults</legend>
          <div className="grid-2">
            <TextField
              name="defaultCurrency"
              label="Default currency"
              defaultValue={settings.defaultCurrency}
              placeholder="usd"
            />
            <TextField
              name="defaultAbstractWordLimit"
              label="Default abstract word limit"
              type="number"
              defaultValue={String(settings.defaultAbstractWordLimit)}
            />
          </div>
        </fieldset>

        <button type="submit" disabled={submitting} className="cap-btn" data-variant="primary">
          {submitting ? "Saving..." : "Save settings"}
        </button>
      </Form>
    </div>
  );
}
