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

export const inputClass = "cap-input";

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
    <fieldset className="card stack-4">
      <legend className="legend">Affiliations</legend>
      <p className="small cap-muted">
        Number each affiliation once, then attach it to authors below. Start typing to pick a known
        institution or add a new one.
      </p>
      {affiliations.length === 0 ? (
        <p className="small cap-muted">No affiliations added.</p>
      ) : (
        <ol className="stack-4">
          {affiliations.map((affiliation, index) => (
            <li key={index} className="stack-2">
              <div className="spread">
                <span className="small strong">Affiliation {index + 1}</span>
                <button
                  type="button"
                  onClick={() => removeAffiliation(index)}
                  className="small strong crit-text"
                >
                  Remove
                </button>
              </div>
              <div className="grid-2">
                <div className="span-2">
                  <InstitutionAutocomplete
                    id={`institution-${index}`}
                    label="Institution"
                    value={affiliation.institution}
                    onChange={(name) => updateAffiliation(index, { institution: name })}
                    onSelect={(suggestion) => selectInstitution(index, suggestion)}
                    inputClassName={inputClass}
                  />
                </div>
                <label className="stack-1">
                  <span className="cap-field-label">Department</span>
                  <input
                    type="text"
                    value={affiliation.department}
                    onChange={(e) =>
                      updateAffiliation(index, {
                        department: e.target.value,
                      })
                    }
                    className="cap-input"
                  />
                </label>
                <label className="stack-1">
                  <span className="cap-field-label">City</span>
                  <input
                    type="text"
                    value={affiliation.city}
                    onChange={(e) => updateAffiliation(index, { city: e.target.value })}
                    className="cap-input"
                  />
                </label>
                <label className="stack-1">
                  <span className="cap-field-label">State or province</span>
                  <input
                    type="text"
                    value={affiliation.region}
                    onChange={(e) => updateAffiliation(index, { region: e.target.value })}
                    className="cap-input"
                  />
                </label>
                <label className="stack-1">
                  <span className="cap-field-label">Country</span>
                  <input
                    type="text"
                    value={affiliation.country}
                    onChange={(e) => updateAffiliation(index, { country: e.target.value })}
                    className="cap-input"
                  />
                </label>
              </div>
            </li>
          ))}
        </ol>
      )}
      <button type="button" onClick={addAffiliation} className="cap-btn">
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
    <fieldset className="card stack-4">
      <legend className="legend">Authors</legend>
      <ol className="stack-4">
        {authors.map((author, index) => (
          <li key={index} className="card card-s stack-3">
            <div className="spread">
              <span className="small strong">Author {index + 1}</span>
              <div className="cluster">
                <button
                  type="button"
                  onClick={() => moveAuthor(index, -1)}
                  disabled={index === 0}
                  aria-label={`Move author ${index + 1} up`}
                  className="cap-btn"
                  data-size="sm"
                >
                  Up
                </button>
                <button
                  type="button"
                  onClick={() => moveAuthor(index, 1)}
                  disabled={index === authors.length - 1}
                  aria-label={`Move author ${index + 1} down`}
                  className="cap-btn"
                  data-size="sm"
                >
                  Down
                </button>
                <button
                  type="button"
                  onClick={() => removeAuthor(index)}
                  className="small strong crit-text"
                >
                  Remove
                </button>
              </div>
            </div>
            <div className="grid-2">
              <label className="stack-1">
                <span className="cap-field-label">First name</span>
                <input
                  type="text"
                  value={author.firstName}
                  onChange={(e) => updateAuthor(index, { firstName: e.target.value })}
                  className="cap-input"
                />
              </label>
              <label className="stack-1">
                <span className="cap-field-label">Last name</span>
                <input
                  type="text"
                  value={author.lastName}
                  onChange={(e) => updateAuthor(index, { lastName: e.target.value })}
                  className="cap-input"
                />
              </label>
              <label className="stack-1 span-2">
                <span className="cap-field-label">Email</span>
                <input
                  type="email"
                  value={author.email}
                  onChange={(e) => updateAuthor(index, { email: e.target.value })}
                  className="cap-input"
                />
              </label>
            </div>
            <div className="cluster">
              <label className="cap-check">
                <input
                  type="checkbox"
                  checked={author.isPresenting}
                  onChange={(e) => updateAuthor(index, { isPresenting: e.target.checked })}
                />
                Presenting
              </label>
              <label className="cap-check">
                <input
                  type="checkbox"
                  checked={author.isCorresponding}
                  onChange={(e) =>
                    updateAuthor(index, {
                      isCorresponding: e.target.checked,
                    })
                  }
                />
                Corresponding
              </label>
            </div>
            {affiliations.length > 0 ? (
              <fieldset className="stack-1">
                <legend className="small">Affiliations</legend>
                <div className="cluster">
                  {affiliations.map((_, affIndex) => {
                    const ordinal = affIndex + 1;
                    return (
                      <label key={affIndex} className="cluster small">
                        <input
                          type="checkbox"
                          checked={author.affiliationOrdinals.includes(ordinal)}
                          onChange={() => toggleAffiliationForAuthor(index, ordinal)}
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
      <button type="button" onClick={addAuthor} className="cap-btn">
        Add author
      </button>
    </fieldset>
  );
}
