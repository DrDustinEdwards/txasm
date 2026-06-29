import { useEffect, useRef, useState } from "react";
import { Form, Link, redirect, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/abstracts.$abstractId.edit";
import { cloudflareContext } from "~/load-context";
import { requireUser } from "~/lib/auth.server";
import {
  DeadlinePassedError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  getActor,
  getDataAccess,
  isChair,
  type AffiliationInput,
  type AuthorInput,
} from "~/lib/data-access";
import { formatDateTime } from "~/lib/format";
import { RichEditor } from "~/components/rich-editor";

export function meta(_args: Route.MetaArgs) {
  return [{ title: "Edit abstract | Texas Branch ASM" }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const { env } = context.get(cloudflareContext);
  const actor = await getActor(env, user.id);
  const da = getDataAccess(env);

  let data;
  try {
    data = await da.abstracts.getForEdit(actor, params.abstractId);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      throw new Response("Forbidden", { status: 403 });
    }
    if (error instanceof NotFoundError) {
      throw new Response("Not found", { status: 404 });
    }
    throw error;
  }

  const categories = await da.abstractCategories.listForSubmission(
    data.abstract.editionId,
  );
  const deadline = data.edition.submissionDeadline;
  const deadlinePassed = !!deadline && Date.now() > deadline.getTime();
  const editable =
    isChair(actor, data.abstract.editionId) || !deadlinePassed;

  return {
    abstract: {
      id: data.abstract.id,
      title: data.abstract.title,
      background: data.abstract.background ?? "",
      methods: data.abstract.methods ?? "",
      results: data.abstract.results ?? "",
      conclusions: data.abstract.conclusions ?? "",
      presentationPreference: data.abstract.presentationPreference,
      categoryId: data.abstract.categoryId ?? "",
      status: data.abstract.status,
    },
    edition: {
      name: data.edition.name,
      submissionDeadline: deadline,
    },
    categories: categories.map((c) => ({ id: c.id, name: c.name })),
    authors: data.authors.map((a) => ({
      firstName: a.firstName,
      lastName: a.lastName,
      email: a.email ?? "",
      isPresenting: a.isPresenting,
      isCorresponding: a.isCorresponding,
      affiliationOrdinals: a.affiliationOrdinals,
    })),
    affiliations: data.affiliations.map((a) => ({
      institution: a.institution,
      department: a.department ?? "",
      city: a.city ?? "",
      country: a.country ?? "",
    })),
    editable,
    deadlinePassed,
  };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const user = await requireUser(request);
  const { env } = context.get(cloudflareContext);
  const actor = await getActor(env, user.id);
  const da = getDataAccess(env);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "save");

  try {
    if (intent === "withdraw") {
      await da.abstracts.withdraw(actor, params.abstractId);
      return redirect("/my/abstracts");
    }

    let authors: unknown;
    let affiliations: unknown;
    try {
      authors = JSON.parse(String(form.get("authors") ?? "[]"));
      affiliations = JSON.parse(String(form.get("affiliations") ?? "[]"));
    } catch {
      return { error: "Could not read the authors or affiliations. Try again." };
    }
    if (!Array.isArray(authors) || !Array.isArray(affiliations)) {
      return { error: "Could not read the authors or affiliations. Try again." };
    }

    const prefRaw = String(form.get("presentationPreference") ?? "either");
    const presentationPreference: "oral" | "poster" | "either" =
      prefRaw === "oral" || prefRaw === "poster" ? prefRaw : "either";

    await da.abstracts.update(actor, params.abstractId, {
      title: String(form.get("title") ?? ""),
      background: String(form.get("background") ?? ""),
      methods: String(form.get("methods") ?? ""),
      results: String(form.get("results") ?? ""),
      conclusions: String(form.get("conclusions") ?? ""),
      presentationPreference,
      categoryId: String(form.get("categoryId") ?? ""),
    });
    await da.abstracts.setAffiliations(
      actor,
      params.abstractId,
      affiliations as AffiliationInput[],
    );
    await da.abstracts.setAuthors(
      actor,
      params.abstractId,
      authors as AuthorInput[],
    );

    if (intent === "submit") {
      await da.abstracts.submit(actor, params.abstractId);
      return redirect("/my/abstracts");
    }
    return { ok: "Draft saved." };
  } catch (error) {
    if (error instanceof ValidationError || error instanceof DeadlinePassedError) {
      return { error: error.message };
    }
    if (error instanceof ForbiddenError) {
      throw new Response("Forbidden", { status: 403 });
    }
    if (error instanceof NotFoundError) {
      throw new Response("Not found", { status: 404 });
    }
    throw error;
  }
}

interface AuthorState {
  firstName: string;
  lastName: string;
  email: string;
  isPresenting: boolean;
  isCorresponding: boolean;
  affiliationOrdinals: number[];
}

interface AffiliationState {
  institution: string;
  department: string;
  city: string;
  country: string;
}

function emptyAuthor(): AuthorState {
  return {
    firstName: "",
    lastName: "",
    email: "",
    isPresenting: false,
    isCorresponding: false,
    affiliationOrdinals: [],
  };
}

function emptyAffiliation(): AffiliationState {
  return { institution: "", department: "", city: "", country: "" };
}

const inputClass =
  "w-full rounded border border-gray-300 px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-gray-700 dark:bg-gray-900";

function titleCase(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function EditAbstract({ loaderData }: Route.ComponentProps) {
  const { abstract, edition, categories, editable } = loaderData;
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";

  const [authors, setAuthors] = useState<AuthorState[]>(() =>
    loaderData.authors.length > 0 ? loaderData.authors : [emptyAuthor()],
  );
  const [affiliations, setAffiliations] = useState<AffiliationState[]>(
    () => loaderData.affiliations,
  );

  const statusRef = useRef<HTMLParagraphElement>(null);
  const error = actionData && "error" in actionData ? actionData.error : null;
  const ok = actionData && "ok" in actionData ? actionData.ok : null;

  useEffect(() => {
    if (actionData) statusRef.current?.focus();
  }, [actionData]);

  function updateAuthor(index: number, patch: Partial<AuthorState>) {
    setAuthors((prev) =>
      prev.map((a, i) => (i === index ? { ...a, ...patch } : a)),
    );
  }
  function addAuthor() {
    setAuthors((prev) => [...prev, emptyAuthor()]);
  }
  function removeAuthor(index: number) {
    setAuthors((prev) => prev.filter((_, i) => i !== index));
  }
  function moveAuthor(index: number, direction: -1 | 1) {
    setAuthors((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }
  function toggleAffiliationForAuthor(index: number, ordinal: number) {
    setAuthors((prev) =>
      prev.map((a, i) => {
        if (i !== index) return a;
        const has = a.affiliationOrdinals.includes(ordinal);
        return {
          ...a,
          affiliationOrdinals: has
            ? a.affiliationOrdinals.filter((o) => o !== ordinal)
            : [...a.affiliationOrdinals, ordinal].sort((x, y) => x - y),
        };
      }),
    );
  }

  function updateAffiliation(index: number, patch: Partial<AffiliationState>) {
    setAffiliations((prev) =>
      prev.map((a, i) => (i === index ? { ...a, ...patch } : a)),
    );
  }
  function addAffiliation() {
    setAffiliations((prev) => [...prev, emptyAffiliation()]);
  }
  function removeAffiliation(index: number) {
    const removedOrdinal = index + 1;
    setAffiliations((prev) => prev.filter((_, i) => i !== index));
    // Renumber author links: drop the removed number, shift higher ones down.
    setAuthors((prev) =>
      prev.map((a) => ({
        ...a,
        affiliationOrdinals: a.affiliationOrdinals
          .filter((o) => o !== removedOrdinal)
          .map((o) => (o > removedOrdinal ? o - 1 : o)),
      })),
    );
  }

  if (!editable) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <h1 className="text-2xl font-semibold">
          {abstract.title ? (
            <span dangerouslySetInnerHTML={{ __html: abstract.title }} />
          ) : (
            "Untitled abstract"
          )}
        </h1>
        <p
          role="status"
          className="rounded border border-gray-200 bg-gray-50 p-3 text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300"
        >
          The submission deadline has passed. This abstract can no longer be
          edited.
        </p>
        <ReadOnlyAbstract
          abstract={abstract}
          authors={loaderData.authors}
          affiliations={loaderData.affiliations}
        />
        <Link
          to="/my/abstracts"
          className="font-medium text-blue-700 hover:underline dark:text-blue-400"
        >
          Back to my abstracts
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Abstract</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {edition.name} . Status: {titleCase(abstract.status)}
          {edition.submissionDeadline
            ? ` . Deadline: ${formatDateTime(edition.submissionDeadline)}`
            : ""}
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
        {error ?? ok ?? ""}
      </p>

      <Form method="post" className="space-y-6">
        <RichEditor
          name="title"
          label="Title"
          mode="title"
          initialHTML={abstract.title}
        />

        <RichEditor
          name="background"
          label="Background"
          mode="body"
          initialHTML={abstract.background}
          showWordCount
        />
        <RichEditor
          name="methods"
          label="Methods"
          mode="body"
          initialHTML={abstract.methods}
          showWordCount
        />
        <RichEditor
          name="results"
          label="Results"
          mode="body"
          initialHTML={abstract.results}
          showWordCount
        />
        <RichEditor
          name="conclusions"
          label="Conclusions"
          mode="body"
          initialHTML={abstract.conclusions}
          showWordCount
        />

        <div className="space-y-1">
          <label htmlFor="categoryId" className="block text-sm font-medium">
            Category
          </label>
          <select
            id="categoryId"
            name="categoryId"
            defaultValue={abstract.categoryId}
            className={inputClass}
          >
            <option value="">No category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label
            htmlFor="presentationPreference"
            className="block text-sm font-medium"
          >
            Presentation preference
          </label>
          <select
            id="presentationPreference"
            name="presentationPreference"
            defaultValue={abstract.presentationPreference}
            className={inputClass}
          >
            <option value="either">Either</option>
            <option value="oral">Oral</option>
            <option value="poster">Poster</option>
          </select>
        </div>

        <fieldset className="space-y-4 rounded border border-gray-200 p-4 dark:border-gray-800">
          <legend className="px-1 text-sm font-medium">Affiliations</legend>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Number each affiliation once, then attach it to authors below.
          </p>
          {affiliations.length === 0 ? (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              No affiliations added.
            </p>
          ) : (
            <ol className="space-y-4">
              {affiliations.map((affiliation, index) => (
                <li key={index} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      Affiliation {index + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeAffiliation(index)}
                      className="text-sm font-medium text-red-700 hover:underline dark:text-red-400"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <label className="space-y-1">
                      <span className="block text-sm">Institution</span>
                      <input
                        type="text"
                        value={affiliation.institution}
                        onChange={(e) =>
                          updateAffiliation(index, {
                            institution: e.target.value,
                          })
                        }
                        className={inputClass}
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="block text-sm">Department</span>
                      <input
                        type="text"
                        value={affiliation.department}
                        onChange={(e) =>
                          updateAffiliation(index, {
                            department: e.target.value,
                          })
                        }
                        className={inputClass}
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="block text-sm">City</span>
                      <input
                        type="text"
                        value={affiliation.city}
                        onChange={(e) =>
                          updateAffiliation(index, { city: e.target.value })
                        }
                        className={inputClass}
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="block text-sm">Country</span>
                      <input
                        type="text"
                        value={affiliation.country}
                        onChange={(e) =>
                          updateAffiliation(index, { country: e.target.value })
                        }
                        className={inputClass}
                      />
                    </label>
                  </div>
                </li>
              ))}
            </ol>
          )}
          <button
            type="button"
            onClick={addAffiliation}
            className="rounded border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-gray-700 dark:hover:bg-gray-900"
          >
            Add affiliation
          </button>
        </fieldset>

        <fieldset className="space-y-4 rounded border border-gray-200 p-4 dark:border-gray-800">
          <legend className="px-1 text-sm font-medium">Authors</legend>
          <ol className="space-y-4">
            {authors.map((author, index) => (
              <li
                key={index}
                className="space-y-3 rounded border border-gray-100 p-3 dark:border-gray-900"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Author {index + 1}</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => moveAuthor(index, -1)}
                      disabled={index === 0}
                      aria-label={`Move author ${index + 1} up`}
                      className="rounded border border-gray-300 px-2 py-1 text-sm disabled:opacity-40 dark:border-gray-700"
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      onClick={() => moveAuthor(index, 1)}
                      disabled={index === authors.length - 1}
                      aria-label={`Move author ${index + 1} down`}
                      className="rounded border border-gray-300 px-2 py-1 text-sm disabled:opacity-40 dark:border-gray-700"
                    >
                      Down
                    </button>
                    <button
                      type="button"
                      onClick={() => removeAuthor(index)}
                      className="text-sm font-medium text-red-700 hover:underline dark:text-red-400"
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label className="space-y-1">
                    <span className="block text-sm">First name</span>
                    <input
                      type="text"
                      value={author.firstName}
                      onChange={(e) =>
                        updateAuthor(index, { firstName: e.target.value })
                      }
                      className={inputClass}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="block text-sm">Last name</span>
                    <input
                      type="text"
                      value={author.lastName}
                      onChange={(e) =>
                        updateAuthor(index, { lastName: e.target.value })
                      }
                      className={inputClass}
                    />
                  </label>
                  <label className="space-y-1 sm:col-span-2">
                    <span className="block text-sm">Email</span>
                    <input
                      type="email"
                      value={author.email}
                      onChange={(e) =>
                        updateAuthor(index, { email: e.target.value })
                      }
                      className={inputClass}
                    />
                  </label>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={author.isPresenting}
                      onChange={(e) =>
                        updateAuthor(index, { isPresenting: e.target.checked })
                      }
                      className="h-4 w-4"
                    />
                    Presenting
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={author.isCorresponding}
                      onChange={(e) =>
                        updateAuthor(index, {
                          isCorresponding: e.target.checked,
                        })
                      }
                      className="h-4 w-4"
                    />
                    Corresponding
                  </label>
                </div>
                {affiliations.length > 0 ? (
                  <fieldset className="space-y-1">
                    <legend className="text-sm">Affiliations</legend>
                    <div className="flex flex-wrap gap-3">
                      {affiliations.map((_, affIndex) => {
                        const ordinal = affIndex + 1;
                        return (
                          <label
                            key={affIndex}
                            className="flex items-center gap-1 text-sm"
                          >
                            <input
                              type="checkbox"
                              checked={author.affiliationOrdinals.includes(
                                ordinal,
                              )}
                              onChange={() =>
                                toggleAffiliationForAuthor(index, ordinal)
                              }
                              className="h-4 w-4"
                            />
                            {ordinal}
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                ) : null}
              </li>
            ))}
          </ol>
          <button
            type="button"
            onClick={addAuthor}
            className="rounded border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-gray-700 dark:hover:bg-gray-900"
          >
            Add author
          </button>
        </fieldset>

        <input type="hidden" name="authors" value={JSON.stringify(authors)} />
        <input
          type="hidden"
          name="affiliations"
          value={JSON.stringify(affiliations)}
        />

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            name="intent"
            value="save"
            disabled={submitting}
            className="rounded border border-gray-300 px-4 py-2 font-medium hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60 dark:border-gray-700 dark:hover:bg-gray-900"
          >
            Save draft
          </button>
          <button
            type="submit"
            name="intent"
            value="submit"
            disabled={submitting}
            className="rounded bg-blue-700 px-4 py-2 font-medium text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
          >
            Submit abstract
          </button>
          <button
            type="submit"
            name="intent"
            value="withdraw"
            disabled={submitting}
            onClick={(e) => {
              if (!window.confirm("Withdraw this abstract?")) e.preventDefault();
            }}
            className="text-sm font-medium text-red-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 dark:text-red-400"
          >
            Withdraw
          </button>
          <Link
            to="/my/abstracts"
            className="text-sm font-medium text-gray-700 hover:underline dark:text-gray-300"
          >
            Back
          </Link>
        </div>
      </Form>
    </div>
  );
}

function ReadOnlyAbstract({
  abstract,
  authors,
  affiliations,
}: {
  abstract: { background: string; methods: string; results: string; conclusions: string };
  authors: Array<{ firstName: string; lastName: string }>;
  affiliations: Array<{ institution: string }>;
}) {
  const sections: Array<[string, string]> = [
    ["Background", abstract.background],
    ["Methods", abstract.methods],
    ["Results", abstract.results],
    ["Conclusions", abstract.conclusions],
  ];
  return (
    <div className="space-y-4">
      {sections
        .filter(([, html]) => html.trim().length > 0)
        .map(([label, html]) => (
          <section key={label} className="space-y-1">
            <h2 className="text-sm font-medium">{label}</h2>
            <div dangerouslySetInnerHTML={{ __html: html }} />
          </section>
        ))}
      {authors.length > 0 ? (
        <section className="space-y-1">
          <h2 className="text-sm font-medium">Authors</h2>
          <p>
            {authors
              .map((a) => `${a.firstName} ${a.lastName}`.trim())
              .filter(Boolean)
              .join(", ")}
          </p>
        </section>
      ) : null}
      {affiliations.length > 0 ? (
        <section className="space-y-1">
          <h2 className="text-sm font-medium">Affiliations</h2>
          <ol className="list-decimal pl-5">
            {affiliations.map((a, i) => (
              <li key={i}>{a.institution}</li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
