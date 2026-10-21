import {
  InstitutionAutocomplete,
  type InstitutionSuggestion,
} from "~/components/institution-autocomplete";

// The author and affiliation editors of the abstract form. The form owns the
// state (authors link to affiliations by ordinal); these render it.
export interface AuthorState {
  firstName: string;
  lastName: string;
  email: string;
  isPresenting: boolean;
  isCorresponding: boolean;
  affiliationOrdinals: number[];
}

export interface AffiliationState {
  institution: string;
  department: string;
  city: string;
  region: string;
  country: string;
}

export function emptyAuthor(): AuthorState {
  return {
    firstName: "",
    lastName: "",
    email: "",
    isPresenting: false,
    isCorresponding: false,
    affiliationOrdinals: [],
  };
}

export function emptyAffiliation(): AffiliationState {
  return { institution: "", department: "", city: "", region: "", country: "" };
}

export const inputClass =
  "w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

const smallButton =
  "rounded-md border border-border-strong px-2 py-1 text-sm text-text disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

export function AffiliationsFieldset({
  affiliations,
  updateAffiliation,
  selectInstitution,
  addAffiliation,
  removeAffiliation,
}: {
  affiliations: AffiliationState[];
  updateAffiliation: (index: number, patch: Partial<AffiliationState>) => void;
  selectInstitution: (index: number, suggestion: InstitutionSuggestion) => void;
  addAffiliation: () => void;
  removeAffiliation: (index: number) => void;
}) {
  return (
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
  );
}

export function AuthorsFieldset({
  authors,
  affiliations,
  updateAuthor,
  addAuthor,
  removeAuthor,
  moveAuthor,
  toggleAffiliationForAuthor,
}: {
  authors: AuthorState[];
  affiliations: AffiliationState[];
  updateAuthor: (index: number, patch: Partial<AuthorState>) => void;
  addAuthor: () => void;
  removeAuthor: (index: number) => void;
  moveAuthor: (index: number, direction: -1 | 1) => void;
  toggleAffiliationForAuthor: (index: number, ordinal: number) => void;
}) {
  return (
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
  );
}
