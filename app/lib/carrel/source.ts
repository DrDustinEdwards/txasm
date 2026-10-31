// The text Carrel edits for one page: front matter with the title and the meta
// description, then the markdown body Prelum renders. The values are JSON
// strings, which YAML reads the same, so any title round-trips.
//
//   ---
//   title: "Award Nominations"
//   description: "Award nominations for the Texas Branch ..."
//   ---
//
//   Recognizing Faculty and Students ...
import { readKey, splitSource } from "@dustinedwards/site-api/frontmatter";

export type PageSource = { title: string; description: string | null; body: string };

/** Throws when the source has no title: every page route shows one. */
export function parseSource(source: string): PageSource {
  const { front, body } = splitSource(source);
  const title = readKey(front, "title").trim();
  if (!title) throw new Error("A page needs a title in its front matter.");
  return { title, description: readKey(front, "description").trim() || null, body };
}
