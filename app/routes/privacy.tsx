import { Title } from "capsomer/react/text";
import { Stack } from "capsomer/react/stack";
import { Link } from "capsomer/react/link";
import { publicPageHeaders } from "@dustinedwards/site-runtime/edge-cache";
import type { Route } from "./+types/privacy";
import { pageHead } from "~/lib/site-meta";

export const headers = () => publicPageHeaders();

export function meta({ matches }: Route.MetaArgs) {
  return pageHead(matches, {
    path: "/privacy",
    name: "Privacy",
    description: "What txasm.org stores and which outside services it uses.",
  });
}

export default function Privacy() {
  return (
    <Stack gap={7}>
      <Title as="h1" size={2}>
        Privacy
      </Title>
      <Stack gap={4}>
        <Title size={4}>Visitors</Title>
        <p className="cap-measure">
          Reading the site needs no account. Cloudflare hosts it and counts page views with
          Cloudflare Web Analytics, which sets no cookie and is off on the sign-in, account,
          submission and review pages. The only cookie a visitor gets is the one that remembers a
          light or dark choice, and only after choosing.
        </p>
      </Stack>
      <Stack gap={4}>
        <Title size={4}>Signed-in accounts</Title>
        <Stack gap={3}>
          <p className="cap-measure">
            Your email address, and any passkey you add (its public half only).
          </p>
          <p className="cap-measure">
            Each sign-in session, for 30 days: your IP address, browser, and the city, region and
            country Cloudflare places the request in. Two cookies keep you signed in and recognize
            the device, one for the session and one for up to 400 days.
          </p>
          <p className="cap-measure">
            A history of sign-ins and account changes, shown on your account page and kept for a
            year.
          </p>
          <p className="cap-measure">
            The abstracts you submit, with their authors, affiliations and emails. They stay in the
            meeting archive for good, and deleting your account does not remove them.
          </p>
        </Stack>
        <p className="cap-measure">
          The sign-in form uses Cloudflare Turnstile to stop automated requests. You can delete your
          account from the account page.
        </p>
      </Stack>
      <Stack gap={4}>
        <Title size={4}>Sponsors</Title>
        <p className="cap-measure">
          The sponsor registration link opens a form run by FormSmarts, which receives what you
          enter there. This site does not.
        </p>
      </Stack>
      <p className="cap-measure">
        TXASM does not sell this information or show ads. Questions go through the{" "}
        <Link to="/contact">contact page</Link>.
      </p>
    </Stack>
  );
}
