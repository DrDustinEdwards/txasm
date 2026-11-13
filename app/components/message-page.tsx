import type { ReactNode } from "react";

// A page that is one message and one way onward: the title, a line of text and the action under them.
export function MessagePage({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action: ReactNode;
}) {
  return (
    <div className="cap-column cap-stack" data-width="narrow" data-gap="6">
      <div className="cap-stack" data-gap="3">
        <h1 className="cap-title" data-size="2">
          {title}
        </h1>
        <p>{text}</p>
      </div>
      <div>{action}</div>
    </div>
  );
}
