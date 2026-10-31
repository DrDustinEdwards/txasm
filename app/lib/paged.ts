// Paged.js, the print polyfill both printable books (abstract book, program) load
// in the page that Browser Rendering turns into a PDF. Self-hosted (MIT, its license
// header kept in the file) at a path naming its version, so a new release cannot
// change pagination under a published book; 0.4.3 is the release pinned on
// 2026-10-21. The file is the npm tarball's dist/paged.polyfill.js, byte for byte.
const PAGED_JS_PATH = "/pagedjs/paged.polyfill-0.4.3.js";
// Subresource integrity for that exact file. The book preview runs on the app origin
// with the chair's session, so a changed file must not run there (Grok audit
// 2026-10-21, TX-1). A new version needs a new hash.
const PAGED_JS_INTEGRITY = "sha384-JkjBt3FPbcQ3WBc3qp+maUIw8YLoZxNNj8H+tn73mljkC1ba8aEPWlgwfCRPpAxV";

// The closing scripts of a printable book. The config signals when Paged.js has
// finished laying out the pages: the PDF render waits on data-pagedjs-done so
// page.pdf captures the paginated output, and the browser preview ignores it.
// The config must run before the polyfill so the auto runner picks it up.
// The config is trusted by its hash (bookPolicy, security-headers.ts), so its text is fixed.
export const PAGED_JS_CONFIG = `
  window.PagedConfig = {
    auto: true,
    after: () => {
      document.documentElement.setAttribute("data-pagedjs-done", "true");
    },
  };
`;
export const PAGED_JS_SCRIPTS = `<script>${PAGED_JS_CONFIG}</script>
<script src="${PAGED_JS_PATH}" integrity="${PAGED_JS_INTEGRITY}" crossorigin="anonymous"></script>`;
