import type { ReactNode } from "react";
import { Stack } from "capsomer/react/stack";
import { Link } from "capsomer/react/link";

// The head of every admin page for one meeting: the page title, the meeting's name and the
// links to its neighbours, ending with "Edit meeting".
export function EditionPageHead({
  title,
  edition,
  links = [],
  children,
}: {
  title: string;
  edition: { id: string; name: string };
  links?: { to: string; label: string }[];
  children?: ReactNode;
}) {
  const all = [...links, { to: `/admin/editions/${edition.id}`, label: "Edit meeting" }];
  return (
    <Stack gap={3}>
      <h1 className="page-title">{title}</h1>
      <p>
        {edition.name}.{" "}
        {all.map((l, i) => (
          <span key={l.to}>
            {i > 0 ? (
              <>
                {" "}
                <span aria-hidden="true">|</span>{" "}
              </>
            ) : null}
            <Link to={l.to} className="strong">
              {l.label}
            </Link>
          </span>
        ))}
      </p>
      {children}
    </Stack>
  );
}
