// The PDF viewer's island (devkit's startIslands, app/site.ts): on a document page, which sends no React, it starts
// Capsomer's viewer behavior on the markup components/document-detail.tsx renders. PDF.js is self-hosted under
// /public/pdfjs and imported from there at runtime, so no bundle pulls it in.
import { enhance } from "capsomer/behavior/pdf-viewer";

export default function pdfViewer() {
  enhance();
}
