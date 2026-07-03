import { useEffect, useRef, useState } from "react";
import { Form, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/admin.settings";
import { cloudflareContext } from "~/load-context";
import { requireAdmin } from "~/lib/auth.server";
import {
  ValidationError,
  getDataAccess,
  type FooterLink,
  type PlatformSettingsPatch,
} from "~/lib/data-access";

export function meta(_args: Route.MetaArgs) {
  return [{ title: "Platform settings | Texas Branch ASM" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireAdmin(request);
  const { env } = context.get(cloudflareContext);
  const settings = await getDataAccess(env).settings.get();
  return { settings };
}

function parseYear(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isInteger(n)) {
    throw new ValidationError("Founding year must be a whole number.");
  }
  return n;
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
  const form = await request.formData();

  try {
    const patch: PlatformSettingsPatch = {
      orgName: String(form.get("orgName") ?? ""),
      shortName: String(form.get("shortName") ?? ""),
      orgFullName: String(form.get("orgFullName") ?? ""),
      tagline: String(form.get("tagline") ?? ""),
      foundingYear: parseYear(form.get("foundingYear")),
      contactEmail: String(form.get("contactEmail") ?? ""),
      facebookUrl: String(form.get("facebookUrl") ?? ""),
      footerLinks: parseFooterLinks(form.get("footerLinks")),
      defaultCurrency: String(form.get("defaultCurrency") ?? ""),
      defaultAbstractWordLimit: parseWordLimit(
        form.get("defaultAbstractWordLimit"),
      ),
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

const inputClass =
  "w-full rounded border border-gray-300 px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-gray-700 dark:bg-gray-900";

const smallButton =
  "rounded border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-gray-700 dark:hover:bg-gray-900";

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
    <div className="space-y-1">
      <label htmlFor={name} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className={inputClass}
      />
    </div>
  );
}

export default function PlatformSettingsScreen({
  loaderData,
}: Route.ComponentProps) {
  const { settings } = loaderData;
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";

  const [footerLinks, setFooterLinks] = useState<FooterLink[]>(
    () => settings.footerLinks,
  );

  const statusRef = useRef<HTMLParagraphElement>(null);
  const error = actionData && "error" in actionData ? actionData.error : null;
  const ok = actionData && "ok" in actionData ? actionData.ok : null;
  useEffect(() => {
    if (actionData) statusRef.current?.focus();
  }, [actionData]);

  function updateLink(index: number, patch: Partial<FooterLink>) {
    setFooterLinks((prev) =>
      prev.map((link, i) => (i === index ? { ...link, ...patch } : link)),
    );
  }
  function addLink() {
    setFooterLinks((prev) => [...prev, { label: "", url: "" }]);
  }
  function removeLink(index: number) {
    setFooterLinks((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Platform settings</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Organization identity and tunable defaults. These drive the site header,
          footer, and home page.
        </p>
      </div>

      <p
        ref={statusRef}
        tabIndex={-1}
        role={error ? "alert" : "status"}
        className={
          error
            ? "rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
            : ok
              ? "rounded border border-green-200 bg-green-50 p-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-300"
              : "sr-only"
        }
      >
        {typeof error === "string" ? error : typeof ok === "string" ? ok : ""}
      </p>

      <Form method="post" className="space-y-8" noValidate>
        <fieldset className="space-y-4 rounded border border-gray-200 p-4 dark:border-gray-800">
          <legend className="px-1 text-sm font-medium">Identity</legend>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
          <TextField
            name="tagline"
            label="Tagline"
            defaultValue={settings.tagline}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField
              name="foundingYear"
              label="Founding year"
              type="number"
              defaultValue={
                settings.foundingYear === null
                  ? ""
                  : String(settings.foundingYear)
              }
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

        <fieldset className="space-y-4 rounded border border-gray-200 p-4 dark:border-gray-800">
          <legend className="px-1 text-sm font-medium">Footer links</legend>
          {footerLinks.length === 0 ? (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              No footer links. Add one below.
            </p>
          ) : (
            <ol className="space-y-3">
              {footerLinks.map((link, index) => (
                <li
                  key={index}
                  className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
                >
                  <label className="space-y-1">
                    <span className="block text-sm">Label</span>
                    <input
                      type="text"
                      value={link.label}
                      onChange={(e) =>
                        updateLink(index, { label: e.target.value })
                      }
                      className={inputClass}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="block text-sm">URL or path</span>
                    <input
                      type="text"
                      value={link.url}
                      onChange={(e) =>
                        updateLink(index, { url: e.target.value })
                      }
                      placeholder="/branch-officers"
                      className={inputClass}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => removeLink(index)}
                    className="text-sm font-medium text-red-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 dark:text-red-400"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ol>
          )}
          <button type="button" onClick={addLink} className={smallButton}>
            Add footer link
          </button>
          <input
            type="hidden"
            name="footerLinks"
            value={JSON.stringify(footerLinks)}
          />
        </fieldset>

        <fieldset className="space-y-4 rounded border border-gray-200 p-4 dark:border-gray-800">
          <legend className="px-1 text-sm font-medium">Defaults</legend>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-blue-700 px-4 py-2 font-medium text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
        >
          {submitting ? "Saving..." : "Save settings"}
        </button>
      </Form>
    </div>
  );
}
