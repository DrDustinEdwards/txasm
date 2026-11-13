import { ComboboxFreeText, type ComboboxOption } from "capsomer/react/combobox";
import { Panel } from "capsomer/react/panel";
import { SortableList, useRows } from "capsomer/react/sortable-list";
// Capsomer's sortable list styles, loaded with the routes that use it rather than on every page.
import "capsomer/sortable-list.css";

// A suggestion from the institution master list (/api/institutions).
export interface InstitutionSuggestion {
  id: string;
  name: string;
  city: string | null;
  region: string | null;
  country: string | null;
}

// The suggestions as combobox options: the label is the name and the hint is the place; the value
// carries the whole suggestion, so picking one can fill the city, region and country.
async function findInstitutions(query: string, signal: AbortSignal): Promise<ComboboxOption[]> {
  const res = await fetch(`/api/institutions?q=${encodeURIComponent(query)}`, {
    headers: { Accept: "application/json" },
    signal,
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { results?: InstitutionSuggestion[] };
  return (data.results ?? []).map((i) => ({
    value: JSON.stringify(i),
    label: i.name,
    hint: [i.city, i.region].filter(Boolean).join(", ") || undefined,
  }));
}

// The author and affiliation editors of the abstract form, on Capsomer's repeatable rows (SortableList's
// stack layout with useRows): drag, the keyboard or Move up and Move down reorder, Remove drops a row and
// Add appends one. The form owns the state (authors link to affiliations by ordinal); these render it.
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

function emptyAffiliation(): AffiliationState {
  return { institution: "", department: "", city: "", region: "", country: "" };
}

export function AffiliationsFieldset({
  affiliations,
  onChange,
  updateAffiliation,
  selectInstitution,
  renumber,
}: {
  affiliations: AffiliationState[];
  onChange: (next: AffiliationState[]) => void;
  updateAffiliation: (index: number, patch: Partial<AffiliationState>) => void;
  selectInstitution: (index: number, suggestion: InstitutionSuggestion) => void;
  /** The authors' ordinals follow a move or a removal: `from[i]` is the old index of the affiliation now
   *  at i, and an old index missing from it was removed. */
  renumber: (from: number[]) => void;
}) {
  const rows = useRows(affiliations, onChange);
  const oldIndex = (id: string) => rows.items.findIndex((r) => r.id === id);
  return (
    <Panel title="Affiliations">
      <div className="cap-stack">
        <p className="cap-text cap-muted" data-size="small">
          Number each affiliation once, then attach it to authors below. Start typing to pick a
          known institution or add a new one.
        </p>
        <SortableList
          aria-label="Affiliations"
          layout="stack"
          className="sort-plain"
          steps="labeled"
          removeStyle="bordered"
          grip={false}
          items={rows.items}
          getId={rows.getId}
          getLabel={(row) => row.value.institution.trim() || `Affiliation ${row.index + 1}`}
          renderHead={(_, { index }) => (
            <span className="cap-text" data-size="small">
              Affiliation {index + 1}
            </span>
          )}
          onReorder={(order) => {
            renumber(order.map(oldIndex));
            rows.onReorder(order);
          }}
          onRemove={(id) => {
            const gone = oldIndex(id);
            renumber(rows.items.map((r) => r.index).filter((i) => i !== gone));
            rows.onRemove(id);
          }}
          onAdd={() => onChange([...affiliations, emptyAffiliation()])}
          addLabel="Add affiliation"
          empty={
            <p className="cap-text cap-muted" data-size="small">
              No affiliations added.
            </p>
          }
          renderItem={({ value: affiliation, index }) => (
            <div className="cap-grid" data-cols="2">
              <div className="cap-full">
                <ComboboxFreeText
                  id={`institution-${index}`}
                  label="Institution"
                  value={affiliation.institution}
                  onValueChange={(name) => updateAffiliation(index, { institution: name })}
                  onPick={(option) =>
                    selectInstitution(index, JSON.parse(option.value) as InstitutionSuggestion)
                  }
                  search={findInstitutions}
                  minSearchLength={2}
                />
              </div>
              <label className="cap-stack" data-gap="2">
                <span className="cap-field-label">Department</span>
                <input
                  type="text"
                  value={affiliation.department}
                  onChange={(e) => updateAffiliation(index, { department: e.target.value })}
                  className="cap-input"
                />
              </label>
              <label className="cap-stack" data-gap="2">
                <span className="cap-field-label">City</span>
                <input
                  type="text"
                  value={affiliation.city}
                  onChange={(e) => updateAffiliation(index, { city: e.target.value })}
                  className="cap-input"
                />
              </label>
              <label className="cap-stack" data-gap="2">
                <span className="cap-field-label">State or province</span>
                <input
                  type="text"
                  value={affiliation.region}
                  onChange={(e) => updateAffiliation(index, { region: e.target.value })}
                  className="cap-input"
                />
              </label>
              <label className="cap-stack" data-gap="2">
                <span className="cap-field-label">Country</span>
                <input
                  type="text"
                  value={affiliation.country}
                  onChange={(e) => updateAffiliation(index, { country: e.target.value })}
                  className="cap-input"
                />
              </label>
            </div>
          )}
        />
      </div>
    </Panel>
  );
}

const authorName = (a: AuthorState) => `${a.firstName} ${a.lastName}`.trim();

export function AuthorsFieldset({
  authors,
  affiliations,
  onChange,
  updateAuthor,
  toggleAffiliationForAuthor,
}: {
  authors: AuthorState[];
  affiliations: AffiliationState[];
  onChange: (next: AuthorState[]) => void;
  updateAuthor: (index: number, patch: Partial<AuthorState>) => void;
  toggleAffiliationForAuthor: (index: number, ordinal: number) => void;
}) {
  const rows = useRows(authors, onChange);
  return (
    <Panel title="Authors">
      <div className="cap-stack">
        <SortableList
          aria-label="Authors"
          layout="stack"
          className="sort-card"
          steps="labeled"
          removeStyle="bordered"
          grip={false}
          items={rows.items}
          getId={rows.getId}
          getLabel={(row) => authorName(row.value) || `Author ${row.index + 1}`}
          renderHead={(_, { index }) => (
            <span className="cap-text" data-size="small">
              Author {index + 1}
            </span>
          )}
          onReorder={rows.onReorder}
          onRemove={rows.onRemove}
          onAdd={() => onChange([...authors, emptyAuthor()])}
          addLabel="Add author"
          renderItem={({ value: author, index }) => (
            <div className="cap-stack" data-gap="4">
              <div className="cap-grid" data-cols="2">
                <label className="cap-stack" data-gap="2">
                  <span className="cap-field-label">First name</span>
                  <input
                    type="text"
                    value={author.firstName}
                    onChange={(e) => updateAuthor(index, { firstName: e.target.value })}
                    className="cap-input"
                  />
                </label>
                <label className="cap-stack" data-gap="2">
                  <span className="cap-field-label">Last name</span>
                  <input
                    type="text"
                    value={author.lastName}
                    onChange={(e) => updateAuthor(index, { lastName: e.target.value })}
                    className="cap-input"
                  />
                </label>
                <label className="cap-stack cap-full" data-gap="2">
                  <span className="cap-field-label">Email</span>
                  <input
                    type="email"
                    value={author.email}
                    onChange={(e) => updateAuthor(index, { email: e.target.value })}
                    className="cap-input"
                  />
                </label>
              </div>
              <div className="cap-cluster">
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
                    onChange={(e) => updateAuthor(index, { isCorresponding: e.target.checked })}
                  />
                  Corresponding
                </label>
              </div>
              {affiliations.length > 0 ? (
                <fieldset className="cap-stack" data-gap="2">
                  <legend className="cap-text" data-size="small">
                    Affiliations
                  </legend>
                  <div className="cap-cluster">
                    {affiliations.map((_, affIndex) => {
                      const ordinal = affIndex + 1;
                      return (
                        <label key={affIndex} className="cap-text cap-cluster" data-size="small">
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
            </div>
          )}
        />
      </div>
    </Panel>
  );
}
