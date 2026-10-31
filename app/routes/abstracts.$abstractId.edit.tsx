import { useEffect, useRef, useState } from "react";
import { Form, redirect, useActionData, useNavigation } from "react-router";
import { Link } from "capsomer/react/link";
import type { Route } from "./+types/abstracts.$abstractId.edit";
import { privateMeta } from "~/lib/site-meta";
import { cloudflareContext } from "~/load-context";
import { requireUser } from "~/lib/auth.server";
import {
  type AffiliationInput,
  type AuthorInput,
  DeadlinePassedError,
  ForbiddenError,
  getActor,
  getDataAccess,
  isChair,
  NotFoundError,
  ValidationError,
} from "~/lib/data-access";
import {
  ABSTRACT_LEVEL_LABELS,
  ABSTRACT_LEVELS,
  ABSTRACT_STATUS_LABELS,
  type AbstractLevel,
  DEFAULT_WORD_LIMIT,
  PRESENTATION_PREFERENCE_LABELS,
  PRESENTATION_PREFERENCES,
  type PresentationPreference,
} from "~/lib/vocab";
import { formatDateTime } from "~/lib/format";
import { countWords } from "~/lib/richtext";
import { RichEditor } from "~/components/rich-editor";
import type { InstitutionSuggestion } from "~/components/institution-autocomplete";
import {
  AffiliationsFieldset,
  type AffiliationState,
  AuthorsFieldset,
  type AuthorState,
  emptyAffiliation,
  emptyAuthor,
  inputClass,
} from "~/components/abstract-authors";
import { DecisionPanel, ReadOnlyAbstract } from "~/components/abstract-read-only";
import { readForm } from "~/lib/form.server";

// An app: the abstract editor. It hydrates (root.tsx, the `hydrate` handle).
export const handle = { hydrate: true };

export function meta({ matches }: Route.MetaArgs) {
  return privateMeta(matches, "Edit abstract");
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

  const categories = await da.abstractCategories.listForSubmission(data.abstract.editionId);
  const deadline = data.edition.submissionDeadline;
  const deadlinePassed = !!deadline && Date.now() > deadline.getTime();
  const editable = isChair(actor, data.abstract.editionId) || !deadlinePassed;

  const canSeeDecision =
    isChair(actor, data.abstract.editionId) || data.abstract.submitterId === actor.userId;
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
  const form = await readForm(request);
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
    await da.abstracts.setAuthors(actor, params.abstractId, authors as AuthorInput[]);

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
    setAuthors((prev) => prev.map((a, i) => (i === index ? { ...a, ...patch } : a)));
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
    setAffiliations((prev) => prev.map((a, i) => (i === index ? { ...a, ...patch } : a)));
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
      <div className="form-page stack-6">
        <h1 className="page-title">
          {abstract.title ? (
            <span dangerouslySetInnerHTML={{ __html: abstract.title }} />
          ) : (
            "Untitled abstract"
          )}
        </h1>
        <DecisionPanel decision={decision} />
        <p role="status" className="card card-s card-sunken cap-muted">
          The submission deadline has passed. This abstract can no longer be edited.
        </p>
        <ReadOnlyAbstract
          bodyText={abstract.bodyText}
          authors={loaderData.authors}
          affiliations={loaderData.affiliations}
        />
        <Link to="/my/abstracts" className="strong">
          Back to my abstracts
        </Link>
      </div>
    );
  }

  return (
    <div className="form-page stack-6">
      <div className="stack-1">
        <h1 className="page-title">Abstract</h1>
        <p className="small cap-muted">
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
        className={error || ok ? "cap-alert" : "cap-sr-only"}
        data-tone={error ? "crit" : "ok"}
      >
        {error ?? ok ?? ""}
      </p>

      <Form method="post" className="stack-6">
        <RichEditor name="title" label="Title" mode="title" initialHTML={abstract.title} />

        <div className="stack-1">
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
            className={overLimit ? "small strong crit-text" : "small cap-muted"}
          >
            {bodyWords} / {edition.wordLimit} words
            {overLimit
              ? ". Over the limit. Trim the body to submit; you can still save a draft."
              : ""}
          </p>
        </div>

        <div className="grid-2">
          <div className="stack-1">
            <label htmlFor="level" className="cap-field-label">
              Level
            </label>
            <select id="level" name="level" defaultValue={abstract.level} className="cap-select">
              <option value="">Choose a level</option>
              {ABSTRACT_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {ABSTRACT_LEVEL_LABELS[level]}
                </option>
              ))}
            </select>
          </div>

          <div className="stack-1">
            <label htmlFor="categoryId" className="cap-field-label">
              Topic
            </label>
            <select
              id="categoryId"
              name="categoryId"
              defaultValue={abstract.categoryId}
              className="cap-select"
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

        <div className="stack-1">
          <label htmlFor="presentationPreference" className="cap-field-label">
            Presentation preference
          </label>
          <select
            id="presentationPreference"
            name="presentationPreference"
            defaultValue={abstract.presentationPreference}
            className="cap-select"
          >
            {PRESENTATION_PREFERENCES.map((pref) => (
              <option key={pref} value={pref}>
                {PRESENTATION_PREFERENCE_LABELS[pref]}
              </option>
            ))}
          </select>
        </div>

        <AffiliationsFieldset
          affiliations={affiliations}
          updateAffiliation={updateAffiliation}
          selectInstitution={selectInstitution}
          addAffiliation={addAffiliation}
          removeAffiliation={removeAffiliation}
        />

        <AuthorsFieldset
          authors={authors}
          affiliations={affiliations}
          updateAuthor={updateAuthor}
          addAuthor={addAuthor}
          removeAuthor={removeAuthor}
          moveAuthor={moveAuthor}
          toggleAffiliationForAuthor={toggleAffiliationForAuthor}
        />

        <input type="hidden" name="authors" value={JSON.stringify(authors)} />
        <input type="hidden" name="affiliations" value={JSON.stringify(affiliations)} />

        <div className="cluster">
          <button
            type="submit"
            name="intent"
            value="save"
            disabled={submitting}
            className="cap-btn"
          >
            Save draft
          </button>
          <button
            type="submit"
            name="intent"
            value="submit"
            disabled={submitting || overLimit}
            className="cap-btn"
            data-variant="primary"
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
            className="small strong crit-text"
          >
            Withdraw
          </button>
          <Link to="/my/abstracts" className="small strong cap-muted">
            Back
          </Link>
        </div>
      </Form>
    </div>
  );
}
