import { Link } from "react-router";
import type { Route } from "./+types/sponsorship";
import { pageHead } from "~/lib/site-meta";

export function meta({ matches }: Route.MetaArgs) {
  return pageHead(matches, {
    path: "/sponsorship",
    name: "Sponsorship",
    description:
      "Sponsor the Texas Branch ASM meetings and support student microbiologists across Texas.",
  });
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
    <div className="stack-8">
      <header className="stack-3">
        <h1 className="page-title">Sponsorship</h1>
        <p className="lead">
          Sponsors help the branch keep meeting registration affordable, fund the
          student awards, and support travel for early-career researchers. Support
          is welcome from companies, laboratories, academic departments, and
          individuals.
        </p>
        <p>
          <a href={SPONSOR_REGISTRATION_URL} target="_blank" rel="noreferrer" className="cap-btn" data-variant="primary">
            Sponsor registration
          </a>
        </p>
      </header>

      <section aria-labelledby="tiers-heading" className="stack-4">
        <h2 id="tiers-heading" className="section-title">
          Sponsorship levels
        </h2>
        <ul className="grid-2">
          {SPONSOR_TIERS.map((tier) => (
            <li key={tier.name} className="card stack-1">
              <div className="spread">
                <h3 className="subsection-title">{tier.name}</h3>
                <p className="subsection-title">{tier.amount}</p>
              </div>
              <p className="small cap-muted">{tier.audience}</p>
              <ul className="bullets small cap-muted tier-benefits">
                {tier.benefits.map((benefit) => (
                  <li key={benefit}>{benefit}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="contact-heading" className="stack-2">
        <h2 id="contact-heading" className="section-title">
          Become a sponsor
        </h2>
        <p className="lead">
          Complete the{" "}
          <a href={SPONSOR_REGISTRATION_URL} target="_blank" rel="noreferrer">
            sponsor registration form
          </a>{" "}
          to reserve a level, or reach the branch through the <Link to="/contact">contact page</Link> to discuss sponsoring an upcoming meeting.
        </p>
      </section>
    </div>
  );
}
