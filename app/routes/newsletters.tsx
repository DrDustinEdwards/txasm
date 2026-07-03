import type { Route } from "./+types/newsletters";
import { pageTitle } from "~/lib/site-meta";

export function meta({ matches }: Route.MetaArgs) {
  return [
    { title: pageTitle(matches, "Newsletters") },
    {
      name: "description",
      content:
        "Newsletters from the Texas Branch of the American Society for Microbiology.",
    },
  ];
}

// Newsletter archive entries. Empty until the back issues are collected and
// hosted (R2 or the app). Keep the shape so links can be dropped in later.
// TODO: add the newsletter back issues (title, date, and a link to the hosted
// PDF or web version). Decide where the files live before wiring the links.
type Newsletter = {
  title: string;
  date: string;
  href: string;
};

const NEWSLETTERS: Newsletter[] = [];

export default function Newsletters() {
  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight text-text">
          Newsletters
        </h1>
        <p className="max-w-2xl text-text-muted">
          The branch newsletter shares meeting recaps, award announcements, and
          news from member institutions across Texas. Past issues are collected
          below.
        </p>
      </header>

      {NEWSLETTERS.length === 0 ? (
        <section
          aria-label="Newsletter archive"
          className="rounded-lg border border-border bg-panel p-6"
        >
          <p className="text-text-muted">
            Back issues are being gathered and will be listed here.
          </p>
        </section>
      ) : (
        <section aria-label="Newsletter archive">
          <ul className="space-y-2">
            {NEWSLETTERS.map((issue) => (
              <li
                key={issue.href}
                className="rounded-lg border border-border bg-surface-raised p-4"
              >
                <a
                  href={issue.href}
                  className="font-medium text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  {issue.title}
                </a>
                <p className="mt-1 text-sm text-text-muted">{issue.date}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
