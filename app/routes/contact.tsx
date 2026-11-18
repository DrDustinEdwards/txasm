import { Title } from "capsomer/react/text";
import { Stack } from "capsomer/react/stack";
import { Link, useRouteLoaderData } from "react-router";
import type { Route } from "./+types/contact";
import type { loader as rootLoader } from "~/root";
import { pageHead } from "~/lib/site-meta";
import { publicPageHeaders } from "@dustinedwards/site-runtime/edge-cache";

// The same for every reader, so the edge stores it (workers/app.ts); admin and Carrel writes purge it.
export const headers = () => publicPageHeaders();

export function meta({ matches }: Route.MetaArgs) {
  return pageHead(matches, {
    path: "/contact",
    name: "Contact",
    description: "How to reach the Texas Branch of the American Society for Microbiology.",
  });
}

export default function Contact() {
  // Contact email and the Facebook group come from platform settings so this
  // page tracks the configured values rather than hardcoding them.
  const rootData = useRouteLoaderData<typeof rootLoader>("root");
  const settings = rootData?.settings;
  const contactEmail = settings?.contactEmail ?? null;
  const facebookUrl = settings?.facebookUrl ?? null;

  return (
    <Stack gap={7}>
      <Stack as="header" gap={4}>
        <Title as="h1" size={2}>
          Contact
        </Title>
      </Stack>

      <Stack as="section" aria-labelledby="reach-heading">
        <Title id="reach-heading" size={4}>
          Reach the branch
        </Title>
        <Stack as="dl">
          {contactEmail ? (
            <Stack gap={2}>
              <dt className="cap-label">Email</dt>
              <dd>
                <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
              </dd>
            </Stack>
          ) : null}
          <Stack gap={2}>
            <dt className="cap-label">Officers</dt>
            <dd>
              <Link to="/branch-officers">Email the branch officers</Link>
            </dd>
          </Stack>
          {facebookUrl ? (
            <Stack gap={2}>
              <dt className="cap-label">Facebook group</dt>
              <dd>
                <a href={facebookUrl}>Join the member group</a>
              </dd>
            </Stack>
          ) : null}
        </Stack>
      </Stack>
    </Stack>
  );
}
