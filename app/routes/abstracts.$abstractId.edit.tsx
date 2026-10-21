import { useEffect, useRef, useState } from "react";
import { Form, Link, redirect, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/abstracts.$abstractId.edit";
import { pageTitle } from "~/lib/site-meta";
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
import {
  ABSTRACT_LEVELS,
  ABSTRACT_LEVEL_LABELS,
  ABSTRACT_STATUS_LABELS,
  DECISION_OUTCOME_LABELS,
  DEFAULT_WORD_LIMIT,
  PRESENTATION_PREFERENCES,
  PRESENTATION_PREFERENCE_LABELS,
  PRESENTATION_TYPE_LABELS,
  type AbstractLevel,
  type DecisionOutcome,
  type PresentationPreference,
  type PresentationType,
} from "~/lib/vocab";
import { formatDateTime } from "~/lib/format";
import { countWords } from "~/lib/richtext";
import { RichEditor } from "~/components/rich-editor";
import {
  InstitutionAutocomplete,
  type InstitutionSuggestion,
} from "~/components/institution-autocomplete";

export function meta({ matches }: Route.MetaArgs) {
  return [{ title: pageTitle(matches, "Edit abstract") }];
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
  const editable = isChair(actor, data.abstract.editionId) || !deadlinePassed;

  const canSeeDecision =
    isChair(actor, data.abstract.editionId) ||
    data.abstract.submitterId === actor.userId;
  const decision = canSeeDecision
    ? await da.decisions.getForAbstract(actor, params.abstractId)
    : null;

  return {
    abstract: {
      id: data.abstract.id,
      title: data.abstract.title,
      bodyText: data.abstract.bodyText ?? "",
      level: data.abstract.level ?? "",
      categoryId: data.abstract.categoryId ?? "",
      presentationPreference: data.abstract.presentationPreference,
      status: data.abstract.status,
    },
    edition: {
      name: data.edition.name,
      submissionDeadline: deadline,
      wordLimit: data.edition.abstractWordLimit ?? DEFAULT_WORD_LIMIT,
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
      region: "",
      country: a.country ?? "",
    })),
    editable,
    deadlinePassed,
    decision,
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
    const presentationPreference: PresentationPreference = (
      PRESENTATION_PREFERENCES as readonly string[]
    ).includes(prefRaw)
      ? (prefRaw as PresentationPreference)
      : "either";

    const levelRaw = String(form.get("level") ?? "");
    const level = (ABSTRACT_LEVELS as readonly string[]).includes(levelRaw)
      ? (levelRaw as AbstractLevel)
      : null;

    await da.abstracts.update(actor, params.abstractId, {
      title: String(form.get("title") ?? ""),
      bodyText: String(form.get("bodyText") ?? ""),
      level,
      categoryId: String(form.get("categoryId") ?? ""),
      presentationPreference,
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
      // Self-grow the institution master list from any new institutions typed.
      const affRows = affiliations as Array<{
        institution?: string;
        city?: string;
        region?: string;
        country?: string;
      }>;
      for (const aff of affRows) {
        const name = (aff.institution ?? "").trim();
        if (name) {
          await da.institutions.ensure(actor, {
            name,
            city: aff.city,
            region: aff.region,
            country: aff.country,
          });
        }
      }
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
  region: string;
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
  return { institution: "", department: "", city: "", region: "", country: "" };
}

const inputClass =
  "w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

const smallButton =
  "rounded-md border border-border-strong px-2 py-1 text-sm text-text disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

export default function EditAbstract({ loaderData }: Route.ComponentProps) {
  const { abstract, edition, categories, editable, decision } = loaderData;
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";

  const [authors, setAuthors] = useState<AuthorState[]>(() =>
    loaderData.authors.length > 0 ? loaderData.authors : [emptyAuthor()],
  );
  const [affiliations, setAffiliations] = useState<AffiliationState[]>(
    () => loaderData.affiliations,
  );
  const [bodyWords, setBodyWords] = useState(() => countWords(abstract.bodyText));
  const overLimit = bodyWords > edition.wordLimit;

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
  function selectInstitution(index: number, suggestion: InstitutionSuggestion) {
    updateAffiliation(index, {
      institution: suggestion.name,
      city: suggestion.city ?? "",
      region: suggestion.region ?? "",
      country: suggestion.country ?? "USA",
    });
  }
  function addAffiliation() {
    setAffiliations((prev) => [...prev, emptyAffiliation()]);
  }
  function removeAffiliation(index: number) {
    const removedOrdinal = index + 1;
    setAffiliations((prev) => prev.filter((_, i) => i !== index));
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
        <h1 className="text-2xl font-semibold text-text">
          {abstract.title ? (
            <span dangerouslySetInnerHTML={{ __html: abstract.title }} />
          ) : (
            "Untitled abstract"
          )}
        </h1>
        <DecisionPanel decision={decision} />
        <p
          role="status"
          className="rounded-md border border-border bg-panel p-3 text-text-muted"
        >
          The submission deadline has passed. This abstract can no longer be
          edited.
        </p>
        <ReadOnlyAbstract
          bodyText={abstract.bodyText}
          authors={loaderData.authors}
          affiliations={loaderData.affiliations}
        />
        <Link
          to="/my/abstracts"
          className="font-medium text-link hover:underline"
        >
          Back to my abstracts
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-text">Abstract</h1>
        <p className="text-sm text-text-muted">
          {edition.name} . Status: {ABSTRACT_STATUS_LABELS[abstract.status]}
          {edition.submissionDeadline
            ? ` . Deadline: ${formatDateTime(edition.submissionDeadline)}`
            : ""}
        </p>
      </div>

      <DecisionPanel decision={decision} />

      <p
        ref={statusRef}
        tabIndex={-1}
        role={error ? "alert" : "status"}
        className={
          error
            ? "rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
            : ok
              ? "rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-300"
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

        <div className="space-y-1">
          <RichEditor
            name="bodyText"
            label="Abstract body"
            mode="body"
            initialHTML={abstract.bodyText}
            describedById="body-count"
            onValueChange={(value) => setBodyWords(countWords(value))}
          />
          <p
            id="body-count"
            aria-live="polite"
            className={
              overLimit
                ? "text-sm font-medium text-red-700 dark:text-red-400"
                : "text-sm text-text-muted"
            }
          >
            {bodyWords} / {edition.wordLimit} words
            {overLimit
              ? ". Over the limit. Trim the body to submit; you can still save a draft."
              : ""}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="level" className="block text-sm font-medium text-text">
              Level
            </label>
            <select
              id="level"
              name="level"
              defaultValue={abstract.level}
              className={inputClass}
            >
              <option value="">Choose a level</option>
              {ABSTRACT_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {ABSTRACT_LEVEL_LABELS[level]}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label
              htmlFor="categoryId"
              className="block text-sm font-medium text-text"
            >
              Topic
            </label>
            <select
              id="categoryId"
              name="categoryId"
              defaultValue={abstract.categoryId}
              className={inputClass}
            >
              <option value="">Choose a topic</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1">
          <label
            htmlFor="presentationPreference"
            className="block text-sm font-medium text-text"
          >
            Presentation preference
          </label>
          <select
            id="presentationPreference"
            name="presentationPreference"
            defaultValue={abstract.presentationPreference}
            className={inputClass}
          >
            {PRESENTATION_PREFERENCES.map((pref) => (
              <option key={pref} value={pref}>
                {PRESENTATION_PREFERENCE_LABELS[pref]}
              </option>
            ))}
          </select>
        </div>

        <fieldset className="space-y-4 rounded-md border border-border p-4">
          <legend className="px-1 text-sm font-medium text-text">
            Affiliations
          </legend>
          <p className="text-sm text-text-muted">
            Number each affiliation once, then attach it to authors below. Start
            typing to pick a known institution or add a new one.
          </p>
          {affiliations.length === 0 ? (
            <p className="text-sm text-text-muted">No affiliations added.</p>
          ) : (
            <ol className="space-y-4">
              {affiliations.map((affiliation, index) => (
                <li key={index} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-text">
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
                    <div className="sm:col-span-2">
                      <InstitutionAutocomplete
                        id={`institution-${index}`}
                        label="Institution"
                        value={affiliation.institution}
                        onChange={(name) =>
                          updateAffiliation(index, { institution: name })
                        }
                        onSelect={(suggestion) =>
                          selectInstitution(index, suggestion)
                        }
                        inputClassName={inputClass}
                      />
                    </div>
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
                      <span className="block text-sm">State or province</span>
                      <input
                        type="text"
                        value={affiliation.region}
                        onChange={(e) =>
                          updateAffiliation(index, { region: e.target.value })
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
            className="rounded-md border border-border-strong px-3 py-2 text-sm font-medium text-text hover:bg-panel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Add affiliation
          </button>
        </fieldset>

        <fieldset className="space-y-4 rounded-md border border-border p-4">
          <legend className="px-1 text-sm font-medium text-text">Authors</legend>
          <ol className="space-y-4">
            {authors.map((author, index) => (
              <li
                key={index}
                className="space-y-3 rounded-md border border-border p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-text">
                    Author {index + 1}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => moveAuthor(index, -1)}
                      disabled={index === 0}
                      aria-label={`Move author ${index + 1} up`}
                      className={smallButton}
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      onClick={() => moveAuthor(index, 1)}
                      disabled={index === authors.length - 1}
                      aria-label={`Move author ${index + 1} down`}
                      className={smallButton}
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
            className="rounded-md border border-border-strong px-3 py-2 text-sm font-medium text-text hover:bg-panel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
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
            className="rounded-md border border-border-strong px-4 py-2 font-medium text-text hover:bg-panel focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
          >
            Save draft
          </button>
          <button
            type="submit"
            name="intent"
            value="submit"
            disabled={submitting || overLimit}
            className="rounded-md bg-primary px-4 py-2 font-medium text-on-primary hover:opacity-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-60"
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
            className="text-sm font-medium text-text-muted hover:text-text"
          >
            Back
          </Link>
        </div>
      </Form>
    </div>
  );
}

function DecisionPanel({
  decision,
}: {
  decision: {
    outcome: string;
    presentationType: string | null;
    decisionMessage: string | null;
  } | null;
}) {
  if (!decision) return null;
  const tone =
    decision.outcome === "accept"
      ? "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950"
      : decision.outcome === "reject"
        ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950"
        : "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950";
  return (
    <section role="status" className={`space-y-2 rounded-md border p-4 ${tone}`}>
      <h2 className="text-lg font-medium">Decision</h2>
      <p className="text-sm">
        <span className="font-medium">Outcome:</span>{" "}
        {DECISION_OUTCOME_LABELS[decision.outcome as DecisionOutcome] ??
          decision.outcome}
        {decision.presentationType
          ? ` (${
              PRESENTATION_TYPE_LABELS[
                decision.presentationType as PresentationType
              ] ?? decision.presentationType
            } presentation)`
          : ""}
      </p>
      {decision.decisionMessage ? (
        <div className="space-y-1">
          <h3 className="text-sm font-medium">Message from the organizers</h3>
          <div
            className="text-sm"
            dangerouslySetInnerHTML={{ __html: decision.decisionMessage }}
          />
        </div>
      ) : null}
    </section>
  );
}

function ReadOnlyAbstract({
  bodyText,
  authors,
  affiliations,
}: {
  bodyText: string;
  authors: Array<{ firstName: string; lastName: string }>;
  affiliations: Array<{ institution: string }>;
}) {
  return (
    <div className="space-y-4">
      {bodyText.trim().length > 0 ? (
        <section className="space-y-1">
          <h2 className="text-sm font-medium text-text">Abstract</h2>
          <div
            className="text-text"
            dangerouslySetInnerHTML={{ __html: bodyText }}
          />
        </section>
      ) : null}
      {authors.length > 0 ? (
        <section className="space-y-1">
          <h2 className="text-sm font-medium text-text">Authors</h2>
          <p className="text-text">
            {authors
              .map((a) => `${a.firstName} ${a.lastName}`.trim())
              .filter(Boolean)
              .join(", ")}
          </p>
        </section>
      ) : null}
      {affiliations.length > 0 ? (
        <section className="space-y-1">
          <h2 className="text-sm font-medium text-text">Affiliations</h2>
          <ol className="list-decimal pl-5 text-text">
            {affiliations.map((a, i) => (
              <li key={i}>{a.institution}</li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
