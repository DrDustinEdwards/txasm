import { accessibilityStatement, ACCESSIBILITY_PATH } from "@drdustinedwards/site-helpers/accessibility";
import { publicPageHeaders } from "@dustinedwards/site-runtime/edge-cache";
import type { Route } from "./+types/accessibility";
import { pageHead } from "~/lib/site-meta";

// The same for every reader, so the edge stores it (workers/app.ts); admin and Carrel writes purge it.
export const headers = () => publicPageHeaders();

// The statement is the network's shared text (Prelum); only the name, the contact page and the date are this site's.
const STATEMENT = accessibilityStatement({
  siteName: "txasm.org",
  contact: { href: "/contact", label: "the contact page" },
  date: "2026-11-01",
});

export function meta({ matches }: Route.MetaArgs) {
  return pageHead(matches, { path: ACCESSIBILITY_PATH, name: STATEMENT.title, description: STATEMENT.description });
}

export default function Accessibility() {
  return (
    <div className="stack-8">
      <header className="stack-3">
        <h1 className="page-title">{STATEMENT.title}</h1>
      </header>
      <div className="stack-4" style={{ maxWidth: "65ch" }} dangerouslySetInnerHTML={{ __html: STATEMENT.html }} />
    </div>
  );
}
