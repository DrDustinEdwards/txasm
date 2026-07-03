import { Link } from "react-router";
import type { Route } from "./+types/awards";
import { pageTitle } from "~/lib/site-meta";

export function meta({ matches }: Route.MetaArgs) {
  return [
    { title: pageTitle(matches, "Awards") },
    {
      name: "description",
      content:
        "The named student and researcher awards of the Texas Branch of the American Society for Microbiology.",
    },
  ];
}

// The eight named awards, with the short descriptions captured from the current
// site. Descriptions are the summary text from the vault note; the full award
// criteria live on the nomination materials.
// TODO: confirm each description against the live /awards page and add the
// endowment or history blurb where the current site carries one.
type Award = {
  name: string;
  description: string;
};

const AWARDS: Award[] = [
  {
    name: "Sarah A. McIntire Award",
    description: "Recognizes graduate research and scholarship.",
  },
  {
    name: "S.E. Sulkin Award",
    description: "Recognizes undergraduate research presentations.",
  },
  {
    name: "O.B. Williams Award",
    description: "Recognizes exceptional graduate researchers.",
  },
  {
    name: "Thomas S. Matney Award",
    description: "Recognizes advances in teaching, research, or service.",
  },
  {
    name: "Joan Abramowitz Award",
    description:
      "Recognizes undergraduate and graduate oral and poster presentations.",
  },
  {
    name: "Samuel Kaplan Award",
    description:
      "Recognizes the top oral and poster presentations by undergraduate and graduate members.",
  },
  {
    name: "Orville Wyss Award",
    description: "Recognizes outstanding graduate students.",
  },
  {
    name: "Charlie Gauntt Award",
    description: "Recognizes undergraduate researchers.",
  },
];

export default function Awards() {
  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight text-text">
          Awards
        </h1>
        <p className="max-w-2xl text-text-muted">
          The branch recognizes outstanding student and faculty work with eight
          named awards, presented at the twice-yearly meetings. Awards cover oral
          and poster presentations, research and scholarship, and teaching and
          service.
        </p>
        <p className="text-sm text-text-muted">
          See{" "}
          <Link
            to="/award-nominations"
            className="text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            nominations
          </Link>{" "}
          for eligibility and how to apply, or{" "}
          <Link
            to="/awardees"
            className="text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            past awardees
          </Link>{" "}
          for previous recipients.
        </p>
      </header>

      <section aria-label="Named awards">
        <ul className="grid gap-4 sm:grid-cols-2">
          {AWARDS.map((award) => (
            <li key={award.name}>
              <article className="h-full rounded-lg border border-border bg-surface-raised p-5">
                <h2 className="text-lg font-semibold text-text">
                  {award.name}
                </h2>
                <p className="mt-2 text-sm text-text-muted">
                  {award.description}
                </p>
              </article>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
