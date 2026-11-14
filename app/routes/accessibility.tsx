import { Title } from "capsomer/react/text";
import { Stack } from "capsomer/react/stack";
import {
  accessibilityStatement,
  ACCESSIBILITY_PATH,
} from "@drdustinedwards/site-helpers/accessibility";
import { publicPageHeaders } from "@dustinedwards/site-runtime/edge-cache";
import type { Route } from "./+types/accessibility";
import { pageHead } from "~/lib/site-meta";
import { RichText } from "capsomer/react/trusted-html";

// The same for every reader, so the edge stores it (workers/app.ts); admin and Carrel writes purge it.
export const headers = () => publicPageHeaders();

// The statement is the network's shared text (Prelum); only the name, the contact page and the date are this site's.
const STATEMENT = accessibilityStatement({
  siteName: "txasm.org",
  contact: { href: "/contact", label: "the contact page" },
  date: "2026-11-01",
  // Built from Capsomer; links in running text are semibold in the link color (no link.css marks), WCAG 1.4.1 by weight.
  capsomer: true,
  links: "bold",
});

export function meta({ matches }: Route.MetaArgs) {
  return pageHead(matches, {
    path: ACCESSIBILITY_PATH,
    name: STATEMENT.title,
    description: STATEMENT.description,
  });
}

export default function Accessibility() {
  return (
    <Stack gap={7}>
      <Stack as="header" gap={4}>
        <Title as="h1" size={2}>
          {STATEMENT.title}
        </Title>
      </Stack>
      <RichText html={STATEMENT.html} className="cap-stack" measure />
    </Stack>
  );
}
