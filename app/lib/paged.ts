// Paged.js, the print polyfill both printable books (abstract book, program) load
// in the page that Browser Rendering turns into a PDF. Pinned so a new Paged.js
// release cannot change pagination under a published book; 0.4.3 is the release
// the unpinned URL served when this was pinned (2026-10-21).
const PAGED_JS_URL = "https://unpkg.com/pagedjs@0.4.3/dist/paged.polyfill.js";

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
<script src="${PAGED_JS_URL}"></script>`;
