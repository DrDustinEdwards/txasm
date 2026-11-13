import { useRouteLoaderData } from "react-router";
import { Empty } from "capsomer/react/empty";
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
    <div className="cap-stack" data-gap="7">
      <header className="cap-stack" data-gap="4">
        <h1 className="cap-title" data-size="2">
          Contact
        </h1>
        <p className="cap-muted cap-measure">
          Questions about meetings, registration, abstracts, or the awards program are welcome.
          Reach the branch by email or through the member group.
        </p>
      </header>

      <section aria-labelledby="reach-heading" className="cap-stack">
        <h2 id="reach-heading" className="cap-title" data-size="4">
          Reach the branch
        </h2>
        <dl className="cap-stack">
          {contactEmail ? (
            <div className="cap-stack" data-gap="2">
              <dt className="cap-label">Email</dt>
              <dd>
                <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
              </dd>
            </div>
          ) : null}
          {facebookUrl ? (
            <div className="cap-stack" data-gap="2">
              <dt className="cap-label">Facebook group</dt>
              <dd>
                <a href={facebookUrl}>Join the member group</a>
              </dd>
            </div>
          ) : null}
        </dl>
        {!contactEmail && !facebookUrl ? (
          <Empty
            kind="nothing-yet"
            title="Contact details are being set up and will appear here."
          />
        ) : null}
      </section>
    </div>
  );
}
