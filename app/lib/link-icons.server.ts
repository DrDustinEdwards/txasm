// The link contract's two site-side inputs (Prelum's `links` and `linkIcons` render options): the site's own origin
// with the network's sites, and a store for the icons of outside sites. Icons are fetched once, at publish, into UPLOADS
// under link-icons/, and served by routes/link-icons.$.ts; a reader's request never fetches one.
import { FAMILY_SITES } from "capsomer/behavior/family-footer";
import { SITE_ORIGIN } from "./site-meta";

const PREFIX = "link-icons/";

/** Prelum's render options for links, for a render run at publish. */
export function linkRenderOptions(env: Env) {
  return {
    links: { origin: SITE_ORIGIN, family: FAMILY_SITES },
    linkIcons: { store: linkIconStore(env) },
  };
}

/** `{ get, put }` over the UPLOADS bucket; the type rides in the object's metadata. */
export function linkIconStore(env: Pick<Env, "UPLOADS">) {
  return {
    async get(host: string) {
      const object = await env.UPLOADS.get(PREFIX + host);
      return object ? { bytes: await object.arrayBuffer(), type: object.customMetadata?.type ?? "" } : null;
    },
    async put(host: string, bytes: Uint8Array, type: string) {
      await env.UPLOADS.put(PREFIX + host, bytes, { customMetadata: { type } });
    },
  };
}
