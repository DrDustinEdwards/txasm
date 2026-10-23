import { useRouteLoaderData } from "react-router";
import type { Route } from "./+types/home";
import type { loader as rootLoader } from "~/root";
import { getDataAccess } from "~/lib/data-access";
import { cloudflareContext } from "~/load-context";

// The welcome and the next-meeting note are edited in Carrel (app/lib/carrel) and stored in D1.
export async function loader({ context }: Route.LoaderArgs) {
  return getDataAccess(context.get(cloudflareContext).env).pages.published("home");
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [
    { title: loaderData?.title ?? "Texas Branch ASM" },
    { name: "description", content: loaderData?.description ?? "" },
  ];
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const rootData = useRouteLoaderData<typeof rootLoader>("root");
  const settings = rootData?.settings;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">
        {settings?.orgFullName ?? ""}
      </h1>
      {settings?.tagline ? (
        <p className="max-w-2xl text-lg text-gray-700 dark:text-gray-300">
          {settings.tagline}
        </p>
      ) : null}
      {loaderData ? (
        <div className="page-prose" dangerouslySetInnerHTML={{ __html: loaderData.html }} />
      ) : null}
    </div>
  );
}
