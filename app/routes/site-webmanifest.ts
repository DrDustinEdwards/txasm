import { webManifest } from "@drdustinedwards/site-helpers/icons";
import { SITE_NAME } from "~/lib/site-meta";

export function loader() {
  const manifest = webManifest({
    name: "Texas Branch of the American Society for Microbiology",
    shortName: SITE_NAME,
    themeColor: "#002868",
    backgroundColor: "#ffffff",
  });
  return new Response(JSON.stringify(manifest), {
    headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=86400" },
  });
}
