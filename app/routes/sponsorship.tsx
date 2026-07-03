import { Link } from "react-router";
import type { Route } from "./+types/sponsorship";
import { pageTitle } from "~/lib/site-meta";

export function meta({ matches }: Route.MetaArgs) {
  return [
    { title: pageTitle(matches, "Sponsorship") },
    {
      name: "description",
      content:
        "Sponsor the Texas Branch ASM meetings and support student microbiologists across Texas.",
    },
  ];
}

// Sponsorship tiers carried over from the current site. The vault note records
// that the site offers tiered sponsor levels but does not capture the tier names
// or amounts, so the list is empty until those are migrated.
// TODO: add the sponsorship tiers (level name, contribution amount, and the
// benefits at each level) from the live /sponsorship page.
type SponsorTier = {
  name: string;
  amount: string;
  benefits: string[];
};

const SPONSOR_TIERS: SponsorTier[] = [];

export default function Sponsorship() {
  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight text-text">
          Sponsorship
        </h1>
        <p className="max-w-2xl text-text-muted">
          Sponsors help the branch keep meeting registration affordable, fund the
          student awards, and support travel for early-career researchers. Support
          is welcome from companies, laboratories, academic departments, and
          individuals.
        </p>
      </header>

      <section aria-labelledby="tiers-heading" className="space-y-4">
        <h2 id="tiers-heading" className="text-xl font-semibold text-text">
          Sponsorship levels
        </h2>
        {SPONSOR_TIERS.length === 0 ? (
          <div className="rounded-lg border border-border bg-panel p-6">
            <p className="text-text-muted">
              The sponsorship levels and benefits are being migrated and will be
              listed here.
            </p>
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {SPONSOR_TIERS.map((tier) => (
              <li key={tier.name}>
                <article className="h-full rounded-lg border border-border bg-surface-raised p-5">
                  <h3 className="text-lg font-semibold text-text">
                    {tier.name}
                  </h3>
                  <p className="mt-1 text-text-muted">{tier.amount}</p>
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-text-muted">
                    {tier.benefits.map((benefit) => (
                      <li key={benefit}>{benefit}</li>
                    ))}
                  </ul>
                </article>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="contact-heading" className="space-y-2">
        <h2 id="contact-heading" className="text-xl font-semibold text-text">
          Become a sponsor
        </h2>
        <p className="max-w-2xl text-text-muted">
          To discuss sponsoring an upcoming meeting, reach the branch through the{" "}
          <Link
            to="/contact"
            className="text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            contact page
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
