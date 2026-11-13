import { createContext } from "react-router";
import type { PublishedPage } from "./data-access";

// Carrel's preview of one site page (app/lib/carrel/adapter.server.ts): set only on the in-process render the preview
// makes, never on a reader's request, so the page's route shows this in place of the published row. The default is
// null, not undefined: React Router's get() throws for a context with no default that nothing set, which is every
// reader's request.
export const pagePreviewContext = createContext<{ slug: string; page: PublishedPage } | null>(null);
