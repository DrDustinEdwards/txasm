// Tags and alt text a model suggests for a library picture: site-api's mediaSuggester (Workers AI, through
// Cloudflare AI Gateway when the site has one). Nothing here writes: a suggestion reaches the file only when an
// editor accepts it in Carrel, as an alt or a tags write. Only pictures an editor uploaded are sent, never a
// visitor's data, and only when an editor asks.

import { mediaSuggester } from "@dustinedwards/site-api";

/** What the model suggests for one stored picture. Throws when the site has no AI binding. */
export const suggestFor = mediaSuggester({
  app: "txasm",
  describe: "on the website of a scientific society, the Texas Branch of the American Society for Microbiology",
});
