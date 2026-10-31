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
    description:
      "How to reach the Texas Branch of the American Society for Microbiology.",
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
    <div className="stack-8">
      <header className="stack-3">
        <h1 className="page-title">Contact</h1>
        <p className="lead">
          Questions about meetings, registration, abstracts, or the awards
          program are welcome. Reach the branch by email or through the member
          group.
        </p>
      </header>

      <section aria-labelledby="reach-heading" className="stack-4">
        <h2 id="reach-heading" className="section-title">
          Reach the branch
        </h2>
        <dl className="stack-4">
          {contactEmail ? (
            <div className="stack-1">
              <dt className="cap-label">Email</dt>
              <dd>
                <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
              </dd>
            </div>
          ) : null}
          {facebookUrl ? (
            <div className="stack-1">
              <dt className="cap-label">Facebook group</dt>
              <dd>
                <a href={facebookUrl}>
                  Join the member group
                </a>
              </dd>
            </div>
          ) : null}
        </dl>
        {!contactEmail && !facebookUrl ? <Empty kind="nothing-yet" title="Contact details are being set up and will appear here." /> : null}
      </section>
    </div>
  );
}
