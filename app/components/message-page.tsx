import { Title } from "capsomer/react/text";
import { Stack } from "capsomer/react/stack";
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
      <Stack gap={3}>
        <Title as="h1" size={2}>
          {title}
        </Title>
        <p>{text}</p>
      </Stack>
      <div>{action}</div>
    </div>
  );
}
