import { Check, TextField } from "capsomer/react/field";
import { RepeaterField } from "capsomer/react/repeater-field";
import { InstitutionAutocomplete } from "~/components/institution-autocomplete";

// The author and affiliation editors of the abstract form, on Capsomer's repeater. The form owns the
// state (authors link to affiliations by ordinal) and posts it as JSON; these render it.
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
  onChange,
}: {
  affiliations: AffiliationState[];
  onChange: (affiliations: AffiliationState[]) => void;
}) {
  return (
    <RepeaterField
      legend="Affiliations"
      help="Number each affiliation once, then attach it to authors below. Start typing to pick a known institution or add a new one."
      rows={affiliations}
      onChange={onChange}
      newRow={emptyAffiliation}
      rowLabel={(i) => `Affiliation ${i + 1}`}
      addLabel="Add affiliation"
    >
      {(affiliation, { index, set }) => (
        <div className="grid-2">
          <div className="span-2">
            <InstitutionAutocomplete
              id={`institution-${index}`}
              label="Institution"
              value={affiliation.institution}
              onChange={(name) => set({ institution: name })}
              onSelect={(suggestion) =>
                set({
                  institution: suggestion.name,
                  city: suggestion.city ?? "",
                  region: suggestion.region ?? "",
                  country: suggestion.country ?? "USA",
                })
              }
              inputClassName={inputClass}
            />
          </div>
          <TextField
            label="Department"
            value={affiliation.department}
            onChange={(e) => set({ department: e.target.value })}
          />
          <TextField
            label="City"
            value={affiliation.city}
            onChange={(e) => set({ city: e.target.value })}
          />
          <TextField
            label="State or province"
            value={affiliation.region}
            onChange={(e) => set({ region: e.target.value })}
          />
          <TextField
            label="Country"
            value={affiliation.country}
            onChange={(e) => set({ country: e.target.value })}
          />
        </div>
      )}
    </RepeaterField>
  );
}

export function AuthorsFieldset({
  authors,
  affiliations,
  onChange,
}: {
  authors: AuthorState[];
  affiliations: AffiliationState[];
  onChange: (authors: AuthorState[]) => void;
}) {
  return (
    <RepeaterField
      legend="Authors"
      rows={authors}
      onChange={onChange}
      newRow={emptyAuthor}
      rowLabel={(i) => `Author ${i + 1}`}
      addLabel="Add author"
      reorder
    >
      {(author, { set }) => (
        <div className="stack-3">
          <div className="grid-2">
            <TextField
              label="First name"
              value={author.firstName}
              onChange={(e) => set({ firstName: e.target.value })}
            />
            <TextField
              label="Last name"
              value={author.lastName}
              onChange={(e) => set({ lastName: e.target.value })}
            />
            <div className="span-2">
              <TextField
                label="Email"
                type="email"
                value={author.email}
                onChange={(e) => set({ email: e.target.value })}
              />
            </div>
          </div>
          <div className="cluster">
            <Check
              label="Presenting"
              checked={author.isPresenting}
              onChange={(e) => set({ isPresenting: e.target.checked })}
            />
            <Check
              label="Corresponding"
              checked={author.isCorresponding}
              onChange={(e) => set({ isCorresponding: e.target.checked })}
            />
          </div>
          {affiliations.length > 0 ? (
            <fieldset className="stack-1">
              <legend className="small">Affiliations</legend>
              <div className="cluster">
                {affiliations.map((_, affIndex) => {
                  const ordinal = affIndex + 1;
                  const has = author.affiliationOrdinals.includes(ordinal);
                  return (
                    <Check
                      key={affIndex}
                      label={ordinal}
                      checked={has}
                      onChange={() =>
                        set({
                          affiliationOrdinals: has
                            ? author.affiliationOrdinals.filter((o) => o !== ordinal)
                            : [...author.affiliationOrdinals, ordinal].sort((x, y) => x - y),
                        })
                      }
                    />
                  );
                })}
              </div>
            </fieldset>
          ) : null}
        </div>
      )}
    </RepeaterField>
  );
}
