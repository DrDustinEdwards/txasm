import { previewContext } from "@dustinedwards/site-runtime/context";
import type { PublishedPage } from "./data-access";

// Carrel's preview of one site page (app/lib/carrel/adapter.server.ts): set only on the in-process render the preview
// makes, never on a reader's request, so the page's route shows this in place of the published row.
export const pagePreviewContext = previewContext<{ slug: string; page: PublishedPage }>();
