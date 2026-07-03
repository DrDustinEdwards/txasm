import { useRouteLoaderData } from "react-router";
import type { Route } from "./+types/contact";
import type { loader as rootLoader } from "~/root";
import { pageTitle } from "~/lib/site-meta";

export function meta({ matches }: Route.MetaArgs) {
  return [
    { title: pageTitle(matches, "Contact") },
    {
      name: "description",
      content:
        "How to reach the Texas Branch of the American Society for Microbiology.",
    },
  ];
}

export default function Contact() {
  // Contact email and the Facebook group come from platform settings so this
  // page tracks the configured values rather than hardcoding them.
  const rootData = useRouteLoaderData<typeof rootLoader>("root");
  const settings = rootData?.settings;
  const contactEmail = settings?.contactEmail ?? null;
  const facebookUrl = settings?.facebookUrl ?? null;

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight text-text">
          Contact
        </h1>
        <p className="max-w-2xl text-text-muted">
          Questions about meetings, registration, abstracts, or the awards
          program are welcome. Reach the branch by email or through the member
          group.
        </p>
      </header>

      <section aria-labelledby="reach-heading" className="space-y-4">
        <h2 id="reach-heading" className="text-xl font-semibold text-text">
          Reach the branch
        </h2>
        <dl className="space-y-4">
          {contactEmail ? (
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                Email
              </dt>
              <dd className="mt-1">
                <a
                  href={`mailto:${contactEmail}`}
                  className="text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  {contactEmail}
                </a>
              </dd>
            </div>
          ) : null}
          {facebookUrl ? (
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                Facebook group
              </dt>
              <dd className="mt-1">
                <a
                  href={facebookUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  Join the member group
                </a>
              </dd>
            </div>
          ) : null}
        </dl>
        {!contactEmail && !facebookUrl ? (
          <div className="rounded-lg border border-border bg-panel p-6">
            <p className="text-text-muted">
              Contact details are being set up and will appear here.
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
