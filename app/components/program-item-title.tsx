import { Text } from "capsomer/react/text";
import { RichText } from "capsomer/react/trusted-html";
import type { ProgramSessionResolved } from "~/lib/data-access";

type Item = ProgramSessionResolved["items"][number];

// What a program item is, in one line: an abstract's code, title and presenter, an invited
// speaker and the talk, or the item's own title. The public program and the program builder
// both show it.
export function ProgramItemTitle({ item }: { item: Item }) {
  if (item.abstractId) {
    return (
      <p>
        {item.abstractCode ? (
          <Text as="span" tone="muted" weight="strong">
            {item.abstractCode}{" "}
          </Text>
        ) : null}
        <RichText
          as="span"
          className="cap-text"
          data-weight="strong"
          html={item.abstractTitle}
          fallback="Abstract"
        />
        {item.presentingAuthorName ? (
          <span className="cap-muted"> . {item.presentingAuthorName}</span>
        ) : null}
      </p>
    );
  }
  if (item.speakerId) {
    return (
      <p>
        <Text as="span" weight="strong">
          {item.speakerName ?? "Invited speaker"}
        </Text>
        {item.speakerTalkTitle ? (
          <span className="cap-muted"> . {item.speakerTalkTitle}</span>
        ) : null}
      </p>
    );
  }
  return <Text weight="strong">{item.customTitle}</Text>;
}
