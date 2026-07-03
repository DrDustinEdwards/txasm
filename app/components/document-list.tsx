import { Link } from "react-router";
import { documentSubtitle, type ArchiveDoc } from "~/lib/document-nav";

// The shared list for a category archive: each document links to its page and
// shows the season/year and editor subtitle. Plain text, escaped by React.
export function DocumentList({
  documents,
  basePath,
}: {
  documents: ArchiveDoc[];
  basePath: string;
}) {
  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-surface-raised">
      {documents.map((doc) => {
        const subtitle = documentSubtitle(doc);
        return (
          <li key={doc.slug} className="p-4">
            <Link
              to={`${basePath}/${doc.slug}`}
              className="font-medium text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              {doc.title}
            </Link>
            {subtitle ? (
              <p className="mt-1 text-sm text-text-muted">{subtitle}</p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
