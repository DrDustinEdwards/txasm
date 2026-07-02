// Edition enums live in the central vocab module now (app/lib/vocab.ts). This
// file re-exports them so existing importers keep their `~/lib/editions` path and
// there is still one source of truth. Prefer importing from ~/lib/vocab in new
// code.
export {
  EDITION_STATUSES,
  EDITION_STATUS_LABELS,
  type EditionStatus,
  type Season,
} from "./vocab";
