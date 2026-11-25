import { Text } from "capsomer/react/text";
import { RichText } from "capsomer/react/trusted-html";
import type { ProgramSessionResolved } from "~/lib/data-access";
import { programKindLabel } from "~/lib/vocab";

type Item = ProgramSessionResolved["items"][number];

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
  // An item whose abstract or speaker was removed keeps its slot and shows its kind.
  return <Text weight="strong">{item.customTitle ?? programKindLabel(item.kind)}</Text>;
}
