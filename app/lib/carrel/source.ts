// The text Carrel edits for one page: front matter with the title and the meta
// description, then the markdown body Prelum renders. The values are JSON
// strings, which YAML reads the same, so any title round-trips.
//
//   ---
//   title: "Award Nominations"
//   description: "Award nominations for the Texas Branch ..."
//   searchTitle: "Nominate a member for a Texas Branch ASM award"
//   ---
//
//   Recognizing Faculty and Students ...
//
// description and the other search fields (searchTitle, image, imageAlt, canonical, noindex) are site-api's.
import { readKey, searchFieldsOf, splitSource, type SearchValues } from "@dustinedwards/site-api/frontmatter";

export type PageSource = { title: string; description: string | null; search: Omit<SearchValues, "description">; body: string };

/** Throws when the source has no title: every page route shows one. A preview shows a draft without one as untitled. */
export function parseSource(source: string, { preview = false } = {}): PageSource {
  const { front, body } = splitSource(source);
  const title = readKey(front, "title").trim() || (preview ? "Untitled" : "");
  if (!title) throw new Error("A page needs a title in its front matter.");
  const { description, ...search } = searchFieldsOf(front);
  return { title, description: description.trim() || null, search, body };
}
