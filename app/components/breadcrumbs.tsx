import { Fragment } from "react";
import { Link } from "react-router";

export interface Crumb {
  label: string;
  to?: string; // omitted for the current page (last crumb)
}

// A breadcrumb trail for deep pages. Pages pass their own trail; the last crumb
// is the current page and is not a link. Presentation only.
export function Breadcrumbs({ trail }: { trail: Crumb[] }) {
  if (trail.length === 0) return null;
  return (
    <nav aria-label="Breadcrumb" className="mb-4 text-sm text-text-muted">
      <ol className="flex flex-wrap items-center gap-1">
        {trail.map((crumb, index) => {
          const last = index === trail.length - 1;
          return (
            <Fragment key={`${crumb.label}-${index}`}>
              <li>
                {crumb.to && !last ? (
                  <Link
                    to={crumb.to}
                    className="text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span aria-current={last ? "page" : undefined} className="text-text">
                    {crumb.label}
                  </span>
                )}
              </li>
              {last ? null : (
                <li aria-hidden="true" className="text-text-muted">
                  /
                </li>
              )}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
