import { Link } from "react-router";
import type { Route } from "./+types/award-nominations";
import { pageTitle } from "~/lib/site-meta";

export function meta({ matches }: Route.MetaArgs) {
  return [
    { title: pageTitle(matches, "Award nominations") },
    {
      name: "description",
      content:
        "Eligibility and the nomination process for the Texas Branch ASM awards.",
    },
  ];
}

export default function AwardNominations() {
  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight text-text">
          Award nominations
        </h1>
        <p className="max-w-2xl text-text-muted">
          Nominations for the branch awards open ahead of each meeting. The
          eligibility rules below are summarized from the current site. The full
          nomination materials, including the application form and deadlines, are
          managed by the awards committee.
        </p>
      </header>

      <section aria-labelledby="eligibility-heading" className="space-y-3">
        <h2
          id="eligibility-heading"
          className="text-xl font-semibold text-text"
        >
          Eligibility
        </h2>
        <ul className="max-w-2xl list-disc space-y-2 pl-5 text-text-muted">
          <li>
            Membership in both the American Society for Microbiology and the
            Texas Branch.
          </li>
          <li>
            Enrollment in an M.S. or Ph.D. program, with the degree not yet
            defended at the time of application.
          </li>
          <li>
            For awards that fund research, an itemized budget and a timeline for
            how the award funds will be used.
          </li>
        </ul>
        {/*
          TODO: replace the summarized eligibility above with the verbatim
          eligibility and process text from the live /award-nominations page.
          The vault note flags that the current site carries the exact wording
          (membership requirements, degree status, itemized budget and timeline)
          and it should be migrated word for word rather than paraphrased.
        */}
      </section>

      <section aria-labelledby="process-heading" className="space-y-3">
        <h2 id="process-heading" className="text-xl font-semibold text-text">
          How to nominate
        </h2>
        <p className="max-w-2xl text-text-muted">
          The step-by-step nomination process, required documents, and submission
          deadlines are being migrated from the current site.
        </p>
        {/*
          TODO: add the verbatim nomination process (who may nominate, required
          documents, where and how to submit, and per-award deadlines) once the
          full text is captured. A later phase may turn this into a real
          nomination workflow rather than a static page.
        */}
      </section>

      <p className="text-sm text-text-muted">
        Browse the{" "}
        <Link
          to="/awards"
          className="text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          full list of awards
        </Link>{" "}
        to see which fits your work.
      </p>
    </div>
  );
}
