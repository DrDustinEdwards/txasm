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

// The external Sponsor Registration form hosted on formsmarts.
const SPONSOR_REGISTRATION_URL = "https://www.formsmarts.com/form/2fql";

// Sponsorship tiers carried over from the current site: level, contribution
// amount, who the level suits, and the benefits at that level.
type SponsorTier = {
  name: string;
  amount: string;
  audience: string;
  benefits: string[];
};

const SPONSOR_TIERS: SponsorTier[] = [
  {
    name: "Platinum",
    amount: "$2,000",
    audience: "Major partners or second-tier corporate sponsors.",
    benefits: [
      "Conference sponsor recognition",
      "Logo on all materials, the registration page, and website slides",
      "Logo on tote bags and conference shirts",
      "Logo on social media",
      "Booth space",
      "Full-page ad in the program booklet",
      "One complimentary registration",
      "One complimentary dinner ticket",
      "Invitation to the welcome reception",
      "Swag and literature in the welcome bag",
    ],
  },
  {
    name: "Gold",
    amount: "$1,000",
    audience: "Mid-tier sponsors or recurring partners.",
    benefits: [
      "Logo on all materials, the registration page, and website slides",
      "Logo on tote bags and conference shirts",
      "Logo on social media",
      "Booth space",
      "Half-page ad in the program booklet",
      "One complimentary registration",
      "One complimentary dinner ticket",
      "Swag in the welcome bag",
    ],
  },
  {
    name: "Silver",
    amount: "$500",
    audience: "Community-based businesses and small foundations.",
    benefits: [
      "Logo on materials, the registration page, and website slides",
      "Logo on tote bags and conference shirts",
      "Logo on social media",
      "Booth space",
      "Quarter-page ad in the program booklet",
      "One complimentary registration",
      "Swag in the welcome bag",
    ],
  },
  {
    name: "Base",
    amount: "$250",
    audience: "Individual donors and friends.",
    benefits: [
      "Complimentary registration",
      "Booth space",
      "Company name listed as a supporter in the program booklet",
      "Swag in the welcome bag",
    ],
  },
];

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
        <p>
          <a
            href={SPONSOR_REGISTRATION_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:opacity-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Sponsor registration
          </a>
        </p>
      </header>

      <section aria-labelledby="tiers-heading" className="space-y-4">
        <h2 id="tiers-heading" className="text-xl font-semibold text-text">
          Sponsorship levels
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2">
          {SPONSOR_TIERS.map((tier) => (
            <li key={tier.name}>
              <article className="flex h-full flex-col rounded-lg border border-border bg-surface-raised p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-lg font-semibold text-text">
                    {tier.name}
                  </h3>
                  <p className="text-lg font-semibold text-text">
                    {tier.amount}
                  </p>
                </div>
                <p className="mt-1 text-sm text-text-muted">{tier.audience}</p>
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-text-muted">
                  {tier.benefits.map((benefit) => (
                    <li key={benefit}>{benefit}</li>
                  ))}
                </ul>
              </article>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="contact-heading" className="space-y-2">
        <h2 id="contact-heading" className="text-xl font-semibold text-text">
          Become a sponsor
        </h2>
        <p className="max-w-2xl text-text-muted">
          Complete the{" "}
          <a
            href={SPONSOR_REGISTRATION_URL}
            target="_blank"
            rel="noreferrer"
            className="text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            sponsor registration form
          </a>{" "}
          to reserve a level, or reach the branch through the{" "}
          <Link
            to="/contact"
            className="text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            contact page
          </Link>{" "}
          to discuss sponsoring an upcoming meeting.
        </p>
      </section>
    </div>
  );
}
