import type { Route } from "./+types/award-nominations";
import { getDataAccess } from "~/lib/data-access";
import { pageHead } from "~/lib/site-meta";
import { cloudflareContext } from "~/load-context";
import { publicPageHeaders } from "@dustinedwards/site-runtime/edge-cache";

// The same for every reader, so the edge stores it (workers/app.ts); admin and Carrel writes purge it.
export const headers = () => publicPageHeaders();

// The page's text is edited in Carrel (app/lib/carrel) and stored in D1.
export async function loader({ context }: Route.LoaderArgs) {
  const page = await getDataAccess(context.get(cloudflareContext).env).pages.published("award-nominations");
  if (!page) throw new Response("Not found", { status: 404 });
  return page;
}

export function meta({ matches, loaderData }: Route.MetaArgs) {
  return pageHead(matches, {
    path: "/award-nominations",
    name: loaderData?.title ?? "Award Nominations",
    description: loaderData?.description || "How to nominate a member for a Texas Branch ASM award.",
  });
}

export default function AwardNominations({ loaderData }: Route.ComponentProps) {
  return (
    <div className="reading stack-3">
      <h1 className="page-title">{loaderData.title}</h1>
      <div className="page-prose" dangerouslySetInnerHTML={{ __html: loaderData.html }} />
    </div>
  );
}
