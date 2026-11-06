// The abstract form's author and affiliation state (authors link to affiliations by
// ordinal), apart from the editors that render it (app/components/abstract-authors.tsx)
// so Fast Refresh keeps working.
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
