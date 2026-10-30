import { Link } from "capsomer/react/link";
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
    <ul className="card-list">
      {documents.map((doc) => {
        const subtitle = documentSubtitle(doc);
        return (
          <li key={doc.slug}>
            <Link to={`${basePath}/${doc.slug}`} className="strong">
              {doc.title}
            </Link>
            {subtitle ? <p className="small cap-muted">{subtitle}</p> : null}
          </li>
        );
      })}
    </ul>
  );
}
