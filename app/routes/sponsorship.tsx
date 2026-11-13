import { Title, Text } from "capsomer/react/text";
import { Stack } from "capsomer/react/stack";
import { ButtonLink, Link } from "capsomer/react/link";
import type { Route } from "./+types/sponsorship";
import { pageHead } from "~/lib/site-meta";
import { publicPageHeaders } from "@dustinedwards/site-runtime/edge-cache";

// The same for every reader, so the edge stores it (workers/app.ts); admin and Carrel writes purge it.
export const headers = () => publicPageHeaders();

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
    <Stack gap={7}>
      <Stack as="header" gap={4}>
        <Title as="h1" size={2}>
          Sponsorship
        </Title>
        <p className="cap-muted cap-measure">
          Sponsors help the branch keep meeting registration affordable, fund the student awards,
          and support travel for early-career researchers. Support is welcome from companies,
          laboratories, academic departments, and individuals.
        </p>
        <p>
          <ButtonLink href={SPONSOR_REGISTRATION_URL} variant="primary">
            Sponsor registration
          </ButtonLink>
        </p>
      </Stack>

      <Stack as="section" aria-labelledby="tiers-heading">
        <Title id="tiers-heading" size={4}>
          Sponsorship levels
        </Title>
        <ul className="cap-grid" data-cols="2">
          {SPONSOR_TIERS.map((tier) => (
            <li key={tier.name}>
              <article className="cap-card">
                <hgroup>
                  <h3>{tier.name}</h3>
                  <p>{tier.amount}</p>
                </hgroup>
                <Stack gap={2}>
                  <Text size="small" tone="muted">
                    {tier.audience}
                  </Text>
                  <Text as="ul" size="small" tone="muted" className="bullets tier-benefits">
                    {tier.benefits.map((benefit) => (
                      <li key={benefit}>{benefit}</li>
                    ))}
                  </Text>
                </Stack>
              </article>
            </li>
          ))}
        </ul>
      </Stack>

      <Stack as="section" aria-labelledby="contact-heading" gap={3}>
        <Title id="contact-heading" size={4}>
          Become a sponsor
        </Title>
        <p className="cap-muted cap-measure">
          Complete the <a href={SPONSOR_REGISTRATION_URL}>sponsor registration form</a> to reserve a
          level, or reach the branch through the <Link to="/contact">contact page</Link> to discuss
          sponsoring an upcoming meeting.
        </p>
      </Stack>
    </Stack>
  );
}
