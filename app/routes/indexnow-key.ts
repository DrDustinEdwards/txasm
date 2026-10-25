// /<key>.txt, the IndexNow key file: Prelum's keyFileResponse, the key as the whole body.
import { keyFileResponse } from "@drdustinedwards/site-helpers/indexnow";
import { INDEXNOW_KEY } from "~/lib/site-meta";

export function loader() {
  return keyFileResponse(INDEXNOW_KEY, { "Cache-Control": "public, max-age=86400" });
}
