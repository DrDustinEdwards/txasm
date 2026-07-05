// Shared brand SVG source of truth. The Texas state silhouette and the TXASM
// starburst mark path data live here once, so the in-app React components and
// the print/PDF cover renderer draw from the same geometry and can never drift.
// Pure data and string builders, no server or React imports, so this is safe on
// both sides of the boundary and inside the pure book/program renderers.

// The Texas state silhouette outline, moved verbatim from brand-footer.tsx.
// Drawn against a viewBox of "0 0 200 190".
export const TEXAS_STATE_PATH =
  "M142.5,190 L136.5,189 L115,179.5 L108,160.5 L97,148.5 L90,133.5 L78.5,123 L76.5,122 L61.5,123 L57,132.5 L53.5,136 L46.5,134 L38.5,130 L32,123.5 L29,114.5 L25,108.5 L0,85.5 L1.5,83 L53.5,83 L55,81.5 L55.5,0 L100.5,0 L101,34.5 L105.5,39 L112.5,40 L119.5,44 L128.5,44 L132.5,48 L137.5,47 L149.5,48 L155.5,52 L160.5,52 L167.5,49 L176.5,48 L192,55.5 L192,81.5 L200,98.5 L196,123.5 L193.5,126 L158.5,146 L152,152.5 L142,166.5 L143,177.5 L144,178.5 L144,188.5 L142.5,190 Z";

// The TXASM starburst mark, the d strings from public/txasm-mark.svg (the class
// "r" group), in file order. Drawn against a viewBox of "22.1 22.4 290.3 358.2".
export const TXASM_MARK_PATHS: readonly string[] = [
  "M158.448,356.619v18.006h17.745v-18.006c-2.934.213-5.885.359-8.873.359s-5.939-.145-8.872-.359Z",
  "M192.299,116.697V28.362h-49.729v40.025c-64.95,11.271-114.491,67.705-114.491,135.468h18.054c0-57.785,41.5-106.115,96.437-117.134v29.923c7.994-1.663,16.271-2.543,24.75-2.543,8.561,0,16.914.902,24.979,2.595Z",
  "M90.094,351.554l15.368,8.873,8.994-15.578c-5.348-2.597-10.475-5.577-15.352-8.901l-9.01,15.606Z",
  "M283.335,312.767l8.873-15.368-15.578-8.993c-2.597,5.347-5.577,10.475-8.9,15.35l15.605,9.01Z",
  "M229.178,360.427l15.367-8.873-9.009-15.605c-4.877,3.323-10.004,6.303-15.352,8.901l8.993,15.577Z",
  "M42.432,297.399l8.873,15.368,15.607-9.011c-3.324-4.877-6.304-10.004-8.9-15.352l-15.58,8.995Z",
  "M46.242,226.667h-18.006v17.745h18.006c-.213-2.934-.359-5.887-.359-8.874s.146-5.938.359-8.871Z",
  "M288.401,244.412h18.006v-17.745h-18.006c.213,2.933.359,5.884.359,8.871s-.146,5.94-.359,8.874Z",
  "M275.237,226.667H59.407c-.238,2.929-.393,5.881-.393,8.871s.155,5.944.394,8.874h52.348c6.156,0,8.34,8.15,3.008,11.227l-45.341,26.179c2.551,5.375,5.539,10.502,8.905,15.348l45.307-26.159c5.332-3.077,11.297,2.888,8.219,8.219l-26.158,45.308c4.846,3.367,9.973,6.355,15.348,8.905l26.178-45.341c3.078-5.331,11.227-3.148,11.227,3.008v52.348c2.929.238,5.882.393,8.872.393s5.943-.155,8.873-.393v-52.348c0-6.156,8.149-8.339,11.227-3.008l26.177,45.341c5.376-2.551,10.503-5.538,15.349-8.905l-26.159-45.308c-3.078-5.331,2.888-11.296,8.22-8.219l45.308,26.159c3.367-4.847,6.355-9.973,8.906-15.348l-45.344-26.179c-5.33-3.077-3.147-11.227,3.008-11.227h52.351c.239-2.93.394-5.883.394-8.874s-.155-5.942-.393-8.871Z",
  "M155.24,166.372l24.121.022c1.934.002,3.502-1.563,3.504-3.496l.015-34.533c-5.084-.734-10.276-1.134-15.56-1.134s-10.477.4-15.562,1.134l-.015,34.504c-.001,1.933,1.564,3.502,3.497,3.503Z",
];

// The mark's own coordinate box, shared by every place that draws it.
export const TXASM_MARK_VIEWBOX = "22.1 22.4 290.3 358.2";

// The mark's paths as an SVG string with a fixed fill, for embedding in the
// print cover (where the mark is a nested svg drawn white on the red stripe).
export function txasmMarkPaths(fill: string): string {
  return TXASM_MARK_PATHS.map(
    (d) => `<path style="fill:${fill}" d="${d}" />`,
  ).join("");
}

// A standalone mark svg with the given fill, for any spot that wants the whole
// element rather than the bare paths.
export function txasmMarkSvg({
  className,
  fill,
}: {
  className?: string;
  fill: string;
}): string {
  const cls = className ? ` class="${className}"` : "";
  return `<svg${cls} viewBox="${TXASM_MARK_VIEWBOX}" xmlns="http://www.w3.org/2000/svg">${txasmMarkPaths(
    fill,
  )}</svg>`;
}
