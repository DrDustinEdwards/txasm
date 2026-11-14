import { Title, Text } from "capsomer/react/text";
import { Stack } from "capsomer/react/stack";
import "capsomer/table.css";
import { Form, redirect, useActionData, useNavigation } from "react-router";
import { MoneyField } from "capsomer/react/field";
import { Panel } from "capsomer/react/panel";
import { Link } from "capsomer/react/link";
import { Table } from "capsomer/react/table";
import type { Route } from "./+types/admin.editions.$editionId.categories";
import { pageTitle } from "~/lib/site-meta";
import { privateMeta } from "@drdustinedwards/site-helpers/head";
import { cloudflareContext } from "@dustinedwards/site-runtime/context";
import { requireAdmin } from "~/lib/auth.server";
import { AlreadyExistsError, ValidationError, getDataAccess } from "~/lib/data-access";
import {
  REGISTRATION_CATEGORY_KEYS,
  REGISTRATION_CATEGORY_KEY_LABELS,
  type RegistrationCategoryKey,
} from "~/lib/vocab";
import { formatMoney, parseMoneyInput } from "@dustinedwards/site-runtime/money";
import { readForm } from "@dustinedwards/site-runtime/body";
import { FORM_LIMIT } from "~/lib/form.server";
// Capsomer styles only this page draws, loaded with it rather than on every page (app.css).
import "capsomer/table.css";

export function meta({ matches }: Route.MetaArgs) {
  return privateMeta(pageTitle(matches, "Registration categories"));
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { actor } = await requireAdmin(request);
  const { env } = context.get(cloudflareContext);
  const da = getDataAccess(env);
  const edition = await da.editions.getById(actor, params.editionId);
  const categories = await da.registrationCategories.listForEdition(actor, params.editionId);
  return { edition, categories };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const { actor } = await requireAdmin(request);
  const form = await readForm(request, FORM_LIMIT);
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
    const amountCents = parseMoneyInput(String(form.get("fee") ?? ""), currency);

    if (!(REGISTRATION_CATEGORY_KEYS as readonly string[]).includes(key)) {
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

export default function EditionCategories({ loaderData }: Route.ComponentProps) {
  const { edition, categories } = loaderData;
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";
  const error = actionData?.error ?? null;

  return (
    <Stack gap={7}>
      <Stack gap={3}>
        <Title as="h1" size={2}>
          Registration categories
        </Title>
        <p>
          {edition.name}.{" "}
          <Link to={`/admin/editions/${edition.id}`} className="cap-text" data-weight="strong">
            Edit meeting
          </Link>
        </p>
      </Stack>

      {error ? (
        <p role="alert" className="cap-alert">
          {error}
        </p>
      ) : null}

      {categories.length === 0 ? (
        <p>No categories yet. Add the first below.</p>
      ) : (
        <Table caption="Registration categories" captionHidden>
          <thead>
            <tr>
              <th scope="col">Label</th>
              <th scope="col">Type</th>
              <th scope="col">Fee</th>
              <th scope="col">Active</th>
              <Text as="th" scope="col" align="end">
                <span className="cap-sr-only">Actions</span>
              </Text>
            </tr>
          </thead>
          <tbody>
            {categories.map((category) => (
              <tr key={category.id}>
                <td>{category.label}</td>
                <td>{REGISTRATION_CATEGORY_KEY_LABELS[category.key]}</td>
                <td>{formatMoney(category.amountCents, category.currency)}</td>
                <td>{category.active ? "Yes" : "No"}</td>
                <Text as="td" align="end">
                  <div className="cap-cluster" data-justify="end">
                    <Link
                      to={`/admin/editions/${edition.id}/categories/${category.id}`}
                      className="cap-text"
                      data-weight="strong"
                    >
                      Edit
                    </Link>
                    {category.active ? (
                      <Form method="post">
                        <input type="hidden" name="intent" value="deactivate" />
                        <input type="hidden" name="categoryId" value={category.id} />
                        <button
                          type="submit"
                          className="cap-btn cap-muted"
                          data-variant="link"
                          data-size="sm"
                        >
                          Deactivate
                        </button>
                      </Form>
                    ) : null}
                  </div>
                </Text>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <Panel title="Add a category">
        <Form method="post" className="cap-stack" noValidate>
          <input type="hidden" name="intent" value="create" />
          <Stack gap={2}>
            <label htmlFor="key" className="cap-field-label">
              Type
            </label>
            <select id="key" name="key" defaultValue="member" className="cap-select">
              {REGISTRATION_CATEGORY_KEYS.map((key) => (
                <option key={key} value={key}>
                  {REGISTRATION_CATEGORY_KEY_LABELS[key]}
                </option>
              ))}
            </select>
          </Stack>
          <Stack gap={2}>
            <label htmlFor="label" className="cap-field-label">
              Label
            </label>
            <input
              id="label"
              name="label"
              type="text"
              required
              placeholder="ASM Member"
              className="cap-input"
            />
          </Stack>
          <MoneyField id="fee" name="fee" label="Fee (dollars)" required placeholder="45.00" />
          <Stack gap={2}>
            <label htmlFor="currency" className="cap-field-label">
              Currency
            </label>
            <input
              id="currency"
              name="currency"
              type="text"
              defaultValue="USD"
              className="cap-input"
            />
          </Stack>
          <Stack gap={2}>
            <label htmlFor="sortOrder" className="cap-field-label">
              Sort order
            </label>
            <input
              id="sortOrder"
              name="sortOrder"
              type="number"
              step="1"
              defaultValue={0}
              className="cap-input"
            />
          </Stack>
          <button type="submit" disabled={submitting} className="cap-btn" data-variant="primary">
            {submitting ? "Adding..." : "Add category"}
          </button>
        </Form>
      </Panel>
    </Stack>
  );
}
