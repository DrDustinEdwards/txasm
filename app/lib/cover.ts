// The shared book/program cover. One parameterized piece so the abstract book
// and the program can never drift: they differ by a single title word today
// ("Abstract Book" vs "Program"). It takes primitives, not the book or program
// data shapes, so it stays decoupled from both. Pure strings, no
// server imports, so it lives outside the data boundary and runs in the same
// pure renderers as book.ts and program-book.ts.
//
// The artwork is the finalized cover: A4 in points (viewBox 0 0 595 842), the
// Texas flag cropped so the page left edge passes through the star center (blue
// field left, white stripe top-right, red stripe bottom-right), the wordmark
// lockup and tagline centered on one axis, the title block in the book serif,
// and the starburst mark white in the red stripe. SVG fills and strokes use
// inline style so the brand tokens resolve (var() does not resolve in SVG
// presentation attributes, only inline style).

import { TEXAS_STATE_PATH, txasmMarkPaths } from "./brand-svg";
import { escapeHtml } from "@dustinedwards/site-runtime/html";

type CoverInput = {
  meetingName: string;
  dates: string | null;
  title: string;
};

// The cover section: a full-bleed inline SVG. meetingName, dates, and title are
// the only variable inputs; everything else is the fixed brand artwork.
export function coverArt({ meetingName, dates, title }: CoverInput): string {
  const datesLine = dates
    ? `<text x="357.5" y="336" text-anchor="middle" font-family="Source Serif 4" font-size="16" style="fill:var(--text-muted)">${escapeHtml(
        dates,
      )}</text>`
    : "";

  return `<section class="cover"><svg class="cover-art" viewBox="0 0 595 842" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="120" height="842" style="fill:var(--brand-blue)" />
  <rect x="120" y="0" width="475" height="421" style="fill:#ffffff" />
  <rect x="120" y="421" width="475" height="421" style="fill:var(--brand-red)" />
  <path style="fill:#ffffff" d="M 0,311 L 25.9,385.4 L 104.6,387 L 41.8,434.6 L 64.7,510 L 0,465 L -64.7,510 L -41.8,434.6 L -104.6,387 L -25.9,385.4 Z" />
  <text x="181.4" y="136" text-anchor="start" font-family="Inter" font-size="44" font-weight="600" letter-spacing="-0.44" style="fill:var(--brand-blue)">Texas</text>
  <svg x="318.8" y="94.7" width="53.3" height="50.6" viewBox="0 0 200 190"><path style="fill:var(--text-muted)" d="${TEXAS_STATE_PATH}" /></svg>
  <text x="388.8" y="136" text-anchor="start" font-family="Inter" font-size="44" font-weight="600" letter-spacing="-0.44" style="fill:var(--brand-red)">Branch</text>
  <text x="357.5" y="166" text-anchor="middle" font-family="Inter" font-size="13" font-weight="500" letter-spacing="2.86" style="fill:var(--text-muted)">AMERICAN SOCIETY FOR MICROBIOLOGY</text>
  <line x1="240" y1="202" x2="475" y2="202" style="stroke:var(--text-muted);stroke-width:1" />
  <text x="357.5" y="264" text-anchor="middle" font-family="Source Serif 4" font-size="46" font-weight="600" style="fill:var(--brand-red)">${escapeHtml(
    title,
  )}</text>
  <text x="357.5" y="308" text-anchor="middle" font-family="Source Serif 4" font-size="23" style="fill:var(--text)">${escapeHtml(
    meetingName,
  )}</text>
  ${datesLine}
  <svg x="296" y="551" width="122" height="151" viewBox="22.1 22.4 290.3 358.2">${txasmMarkPaths(
    "#ffffff",
  )}</svg>
</svg></section>`;
}

// The four self-hosted @font-face rules the cover and book depend on. Bundled
// woff2 under public/fonts, served same-origin, so the headless PDF has zero
// network font dependency. font-display: block so text never paints in a
// fallback face before the real font loads.
export function coverFontFaces(): string {
  return `
    @font-face { font-family: "Source Serif 4"; font-style: normal; font-weight: 400; font-display: block; src: url("/fonts/source-serif-4-latin-400.woff2") format("woff2"); }
    @font-face { font-family: "Source Serif 4"; font-style: normal; font-weight: 600; font-display: block; src: url("/fonts/source-serif-4-latin-600.woff2") format("woff2"); }
    @font-face { font-family: "Inter"; font-style: normal; font-weight: 500; font-display: block; src: url("/fonts/inter-latin-500.woff2") format("woff2"); }
    @font-face { font-family: "Inter"; font-style: normal; font-weight: 600; font-display: block; src: url("/fonts/inter-latin-600.woff2") format("woff2"); }
  `;
}

// Brand tokens (light, mirroring app.css) plus the full-bleed cover page. The
// print document does not load app.css, so the tokens the cover SVG reads are
// defined here. The cover is its own zero-margin page.
export function coverStyles(): string {
  return `
    :root {
      --brand-blue: #002868;
      --brand-red: #a30e28;
      --text: #1a1a1a;
      --text-muted: #595959;
    }
    @page cover { margin: 0; @top-center { content: none } @bottom-center { content: none } }
    .cover { page: cover; break-after: page; }
    .cover svg.cover-art { display: block; width: 210mm; height: 297mm; }
  `;
}
