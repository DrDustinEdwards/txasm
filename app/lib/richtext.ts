// The abstract text's inline formatting (CLAUDE.md hard rule 5): the title allows italic only; the structured
// sections also allow superscript and subscript. Nothing else. The sanitizer is Capsomer's rich text field's
// (capsomer/behavior/rich-text-field), the same one the editor runs; the server runs it on every save, so client input
// is never trusted.

import { sanitizeRichText } from "capsomer/behavior/rich-text-field";

export const TITLE_TAGS = ["em"] as const;
export const BODY_TAGS = ["em", "sup", "sub"] as const;

export const sanitizeTitle = (input: string): string => sanitizeRichText(input, TITLE_TAGS);
export const sanitizeBody = (input: string): string => sanitizeRichText(input, BODY_TAGS);
