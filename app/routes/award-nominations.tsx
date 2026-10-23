import type { Route } from "./+types/award-nominations";
import { getDataAccess } from "~/lib/data-access";
import { pageTitle } from "~/lib/site-meta";
import { cloudflareContext } from "~/load-context";

// The page's text is edited in Carrel (app/lib/carrel) and stored in D1.
export async function loader({ context }: Route.LoaderArgs) {
  const page = await getDataAccess(context.get(cloudflareContext).env).pages.published("award-nominations");
  if (!page) throw new Response("Not found", { status: 404 });
  return page;
}

export function meta({ matches, loaderData }: Route.MetaArgs) {
  return [
    { title: pageTitle(matches, loaderData?.title ?? "Award Nominations") },
    { name: "description", content: loaderData?.description ?? "" },
  ];
}

export default function AwardNominations({ loaderData }: Route.ComponentProps) {
  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <h1 className="text-3xl font-semibold tracking-tight text-text">{loaderData.title}</h1>
      <div className="page-prose" dangerouslySetInnerHTML={{ __html: loaderData.html }} />
    </div>
  );
}
