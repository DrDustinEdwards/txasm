// Paged.js, the print polyfill both printable books (abstract book, program) load
// in the page that Browser Rendering turns into a PDF. Pinned so a new Paged.js
// release cannot change pagination under a published book; 0.4.3 is the release
// the unpinned URL served when this was pinned (2026-10-21).
const PAGED_JS_URL = "https://unpkg.com/pagedjs@0.4.3/dist/paged.polyfill.js";
// Subresource integrity for that exact file, taken from the npm tarball of
// pagedjs@0.4.3 (unpkg serves the tarball's bytes). The book preview runs on the
// app origin with the chair's session, so a changed file must not run there
// (Grok audit 2026-10-21, TX-1). A new pin needs a new hash.
const PAGED_JS_INTEGRITY = "sha384-JkjBt3FPbcQ3WBc3qp+maUIw8YLoZxNNj8H+tn73mljkC1ba8aEPWlgwfCRPpAxV";

// The closing scripts of a printable book. The config signals when Paged.js has
// finished laying out the pages: the PDF render waits on data-pagedjs-done so
// page.pdf captures the paginated output, and the browser preview ignores it.
// The config must run before the polyfill so the auto runner picks it up.
export const PAGED_JS_SCRIPTS = `<script>
  window.PagedConfig = {
    auto: true,
    after: () => {
      document.documentElement.setAttribute("data-pagedjs-done", "true");
    },
  };
</script>
<script src="${PAGED_JS_URL}" integrity="${PAGED_JS_INTEGRITY}" crossorigin="anonymous"></script>`;
