// The arranged abstract book renderer. Pure: it takes the chair's arrangement
// (BookRenderData from books.renderData) and returns one self-contained,
// print-ready HTML document. It imports nothing server-only. Titles and body
// sections are already sanitized HTML (em/sup/sub only) and are placed verbatim;
// plain-text fields are escaped.
//
// Pagination, the table of contents page numbers, running headers, and page
// numbers are handled by Paged.js in the browser. Browser Rendering runs this
// same HTML to produce the stored PDF (see book-pdf.server.ts).

import type {
  BookAffiliation,
  BookAuthor,
  BookRenderData,
  BookRenderEntry,
} from "./data-access";
import { coverArt, coverFontFaces, coverStyles } from "./cover";
import { escapeHtml } from "@dustinedwards/site-runtime/html";
import { PAGED_JS_SCRIPTS } from "./paged";
import { isEmptyRichText } from "./richtext";

// Escape a string for use inside a CSS string literal (the running header).
function escapeCssString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\s+/g, " ").trim();
}

function joinParts(parts: Array<string | null>): string {
  return parts
    .map((p) => (p ? p.trim() : ""))
    .filter((p) => p.length > 0)
    .join(", ");
}

const DATE_FMT = new Intl.DateTimeFormat("en-US", {
  dateStyle: "long",
  timeZone: "UTC",
});

function formatMeetingDates(
  start: Date | null,
  end: Date | null,
): string {
  if (start && end) {
    if (start.getTime() === end.getTime()) return DATE_FMT.format(start);
    return `${DATE_FMT.format(start)} to ${DATE_FMT.format(end)}`;
  }
  if (start) return DATE_FMT.format(start);
  if (end) return DATE_FMT.format(end);
  return "";
}

function authorLine(authors: BookAuthor[]): string {
  return authors
    .map((author) => {
      const name = escapeHtml(`${author.firstName} ${author.lastName}`.trim());
      const nameHtml = author.isPresenting ? `<strong>${name}</strong>` : name;
      const ordinals =
        author.affiliationOrdinals.length > 0
          ? `<sup>${author.affiliationOrdinals.join(",")}</sup>`
          : "";
      const corresponding = author.isCorresponding ? "<sup>*</sup>" : "";
      return `${nameHtml}${ordinals}${corresponding}`;
    })
    .join(", ");
}

function affiliationsBlock(affiliations: BookAffiliation[]): string {
  if (affiliations.length === 0) return "";
  const items = affiliations
    .map(
      (a) =>
        `<p class="affiliation"><sup>${a.ordinal}</sup> ${escapeHtml(
          joinParts([a.department, a.institution, a.city, a.country]),
        )}</p>`,
    )
    .join("");
  return `<div class="affiliations">${items}</div>`;
}

// The abstract body fields bodyBlock renders (structured sections with a bodyText
// fallback). Matches the corresponding fields on BookRenderEntry.
type BookBodyFields = {
  background: string | null;
  methods: string | null;
  results: string | null;
  conclusions: string | null;
  bodyText: string | null;
};

function bodyBlock(abstract: BookBodyFields): string {
  const sections: Array<[string, string | null]> = [
    ["Background", abstract.background],
    ["Methods", abstract.methods],
    ["Results", abstract.results],
    ["Conclusions", abstract.conclusions],
  ];
  const filled = sections.filter(
    ([, html]) => html && !isEmptyRichText(html),
  );
  if (filled.length > 0) {
    return filled
      .map(
        ([label, html]) =>
          `<div class="section"><h4 class="section-heading">${label}</h4><div class="section-body">${html}</div></div>`,
      )
      .join("");
  }
  if (abstract.bodyText && !isEmptyRichText(abstract.bodyText)) {
    return `<div class="section-body">${abstract.bodyText}</div>`;
  }
  return "";
}

// ---------------------------------------------------------------------------
// The renderer builds: cover, sections-only TOC (page numbers via Paged.js
// target-counter), abstracts with their codes, and an all-authors index keyed by
// code. bodyBlock, authorLine, and affiliationsBlock above are shared helpers.
// ---------------------------------------------------------------------------

function arrangedCover(data: BookRenderData): string {
  return coverArt({
    meetingName: data.edition.name,
    dates: formatMeetingDates(
      data.edition.meetingStartsAt,
      data.edition.meetingEndsAt,
    ),
    title: "Abstract Book",
  });
}

function arrangedEntryArticle(entry: BookRenderEntry, anchorId: string): string {
  const code = entry.code
    ? `<span class="abstract-number">${escapeHtml(entry.code)}</span> `
    : "";
  const presentation = entry.presentationType
    ? `<span class="presentation">${
        entry.presentationType === "oral" ? "Oral" : "Poster"
      }</span>`
    : "";
  return `<article class="abstract" id="${anchorId}">
  <header class="abstract-header">
    <h3 class="abstract-title">${code}${entry.title}${presentation}</h3>
    <p class="author-line">${authorLine(entry.authors)}</p>
    ${affiliationsBlock(entry.affiliations)}
  </header>
  <div class="abstract-body">${bodyBlock(entry)}</div>
</article>`;
}

// TOC lists sections only. Page numbers resolve at render via Paged.js
// target-counter against each section heading id; the code range is the nicety.
function arrangedTableOfContents(data: BookRenderData): string {
  const items = data.sections
    .map(
      (section) =>
        `<li class="book-toc-entry"><a href="#section-${section.id}"><span class="book-toc-title">${escapeHtml(
          section.title,
        )}</span>${
          section.codeRange
            ? `<span class="book-toc-range"> ${escapeHtml(section.codeRange)}</span>`
            : ""
        }</a></li>`,
    )
    .join("");
  return `<nav class="toc" aria-label="Contents">
  <h2 class="page-title">Contents</h2>
  <ul class="book-toc-list">${items}</ul>
</nav>`;
}

function arrangedBody(data: BookRenderData): string {
  const sections = data.sections
    .map(
      (section) =>
        `<section class="book-section"><h2 class="book-section-heading" id="section-${section.id}">${escapeHtml(
          section.title,
        )}</h2>${section.entries
          .map((entry, i) => arrangedEntryArticle(entry, `entry-${section.id}-${i}`))
          .join("")}</section>`,
    )
    .join("");
  return `<section class="abstracts">${sections}</section>`;
}

function arrangedIndex(data: BookRenderData): string {
  if (data.authorIndex.length === 0) return "";
  const items = data.authorIndex
    .map(
      (entry) =>
        `<li class="index-entry"><span class="index-name">${escapeHtml(entry.name)}</span> <span class="index-numbers">${entry.codes
          .map((c) => escapeHtml(c))
          .join(", ")}</span></li>`,
    )
    .join("");
  return `<section class="author-index">
  <h2 class="page-title">Author index</h2>
  <ul class="index-list">${items}</ul>
</section>`;
}

function arrangedPrintStyles(meetingName: string): string {
  const header = escapeCssString(meetingName);
  return `
    ${coverFontFaces()}
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    html { font-family: "Source Serif 4", Georgia, "Times New Roman", serif; color: #111; }
    body { margin: 0; font-size: 10.5pt; line-height: 1.45; }
    h1, h2, h3, h4 { font-family: "Source Serif 4", Georgia, "Times New Roman", serif; color: #111; }
    sup { font-size: 0.7em; line-height: 0; }

    ${coverStyles()}

    @page {
      size: A4;
      margin: 20mm 18mm 18mm 18mm;
      @top-center { content: "${header}"; font-family: Arial, sans-serif; font-size: 8.5pt; color: #666; }
      @bottom-center { content: counter(page); font-family: Arial, sans-serif; font-size: 8.5pt; color: #666; }
    }
    @page :first { @top-center { content: none; } }

    .book-note { padding-top: 12pt; font-size: 11pt; color: #555; }

    .page-title { font-family: "Source Serif 4", Georgia, "Times New Roman", serif; font-size: 18pt; border-bottom: 1px solid #ccc; padding-bottom: 4pt; margin: 0 0 12pt; }

    .toc { break-after: page; }
    .book-toc-list { list-style: none; margin: 0; padding: 0; }
    .book-toc-entry { margin: 4pt 0; }
    .book-toc-entry a { text-decoration: none; color: #111; display: block; }
    .book-toc-entry a::after {
      content: leader(". ") target-counter(attr(href), page);
      color: #444;
    }
    .book-toc-range { color: #555; font-variant-numeric: tabular-nums; }

    .book-section { break-before: page; }
    .book-section-heading { font-size: 15pt; border-bottom: 2px solid #222; padding-bottom: 3pt; margin: 0 0 10pt; }

    .abstract { margin: 0 0 14pt; }
    .abstract-header { break-inside: avoid; break-after: avoid; }
    .abstract-title { font-size: 12pt; margin: 0 0 3pt; break-after: avoid; }
    .abstract-number { color: #444; font-variant-numeric: tabular-nums; }
    .presentation {
      display: inline-block; margin-left: 6pt; padding: 0 5pt;
      font-family: Arial, sans-serif; font-size: 7.5pt; text-transform: uppercase;
      letter-spacing: 0.04em; color: #444; border: 1px solid #bbb; border-radius: 3px;
      vertical-align: middle;
    }
    .author-line { margin: 0 0 3pt; }
    .affiliations { margin: 0 0 6pt; font-size: 9pt; color: #333; }
    .affiliation { margin: 0; }
    .section { margin: 4pt 0; }
    .section-heading { font-size: 10pt; margin: 6pt 0 1pt; }
    .section-body { margin: 0; text-align: justify; }
    .abstract-body h4 { break-after: avoid; }

    .author-index { break-before: page; }
    .index-list { list-style: none; margin: 0; padding: 0; column-count: 2; column-gap: 12mm; }
    .index-entry { break-inside: avoid; margin: 1pt 0; font-size: 9.5pt; }
    .index-numbers { color: #555; }
  `;
}

export function renderArrangedBook(data: BookRenderData): string {
  const body =
    data.entryCount === 0
      ? `${arrangedCover(data)}
<section class="empty-book"><p class="book-note">No abstracts are included in this book yet. Generate from accepted abstracts, then arrange.</p></section>`
      : `${arrangedCover(data)}${arrangedTableOfContents(data)}${arrangedBody(data)}${arrangedIndex(data)}`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(data.edition.name)} Abstract Book</title>
<style>${arrangedPrintStyles(data.edition.name)}</style>
</head>
<body>
${body}
${PAGED_JS_SCRIPTS}
</body>
</html>`;
}
