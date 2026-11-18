import { Title } from "capsomer/react/text";
import { Stack } from "capsomer/react/stack";
import type { ReactNode } from "react";

// A page that is one message and one way onward: the title, a line of text when there is one and the action under them.
export function MessagePage({
  title,
  text,
  action,
}: {
  title: string;
  text?: string;
  action: ReactNode;
}) {
  return (
    <div className="cap-column cap-stack" data-width="narrow" data-gap="6">
      <Stack gap={3}>
        <Title as="h1" size={2}>
          {title}
        </Title>
        {text ? <p>{text}</p> : null}
      </Stack>
      <div>{action}</div>
    </div>
  );
}
