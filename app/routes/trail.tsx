import type { Route } from "./+types/trail";
import { pageTitle } from "~/lib/site-meta";

export function meta({ matches }: Route.MetaArgs) {
  return [
    { title: pageTitle(matches, "Trail") },
    {
      name: "description",
      content: "Trail content from the Texas Branch ASM site.",
    },
  ];
}

export default function Trail() {
  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight text-text">
          Trail
        </h1>
      </header>

      {/*
        TODO: carry over the Trail page content from the live site. The vault
        note lists Trail under the Meetings menu but does not capture its text,
        so the page ships as a shell. Do not invent the content; fetch the real
        copy (and any linked files) at content-migration time and fill it in.
      */}
      <section
        aria-label="Trail"
        className="rounded-lg border border-border bg-panel p-6"
      >
        <p className="text-text-muted">
          This page is being migrated from the previous site and will be
          available shortly.
        </p>
      </section>
    </div>
  );
}
