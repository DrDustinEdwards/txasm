// Display labels for program item kinds and invited-speaker roles. Pure and
// free of server imports (types only, erased at build), so it is safe on both
// sides of the server/client boundary. The unions come from the data-access
// layer, so a new kind or role there is a type error here until it is labeled.
import type { ProgramItemKind, SpeakerRole } from "~/lib/data-access";

export const PROGRAM_ITEM_KINDS: readonly ProgramItemKind[] = [
  "talk",
  "poster",
  "keynote",
  "award",
  "meal",
  "break",
  "business",
  "social",
  "panel",
  "networking",
  "career",
  "other",
];

const PROGRAM_ITEM_KIND_LABELS: Record<ProgramItemKind, string> = {
  talk: "Talk",
  poster: "Poster",
  keynote: "Keynote",
  award: "Award Lecture",
  meal: "Meal",
  break: "Break",
  business: "Business Meeting",
  social: "Social",
  panel: "Panel",
  networking: "Networking",
  career: "Career",
  other: "Other",
};

export function programKindLabel(kind: ProgramItemKind): string {
  return PROGRAM_ITEM_KIND_LABELS[kind] ?? "Other";
}

export const SPEAKER_ROLES: readonly SpeakerRole[] = [
  "keynote",
  "goldschmidt_lecture",
  "award_lecture",
  "career",
  "other",
];

const SPEAKER_ROLE_LABELS: Record<SpeakerRole, string> = {
  keynote: "Keynote",
  goldschmidt_lecture: "Goldschmidt Lecture",
  award_lecture: "Award Lecture",
  career: "Career",
  other: "Other",
};

export function speakerRoleLabel(role: SpeakerRole | null): string {
  return role ? SPEAKER_ROLE_LABELS[role] ?? "Other" : "";
}
