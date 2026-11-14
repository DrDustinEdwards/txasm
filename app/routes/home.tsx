import { Title, Text } from "capsomer/react/text";
import { Stack } from "capsomer/react/stack";
import { useRouteLoaderData } from "react-router";
import { jsonLd } from "@drdustinedwards/site-helpers/schema";
import { pageHead, siteLd } from "~/lib/site-meta";
import type { Route } from "./+types/home";
import type { loader as rootLoader } from "~/root";
import { getDataAccess } from "~/lib/data-access";
import { cloudflareContext } from "@dustinedwards/site-runtime/context";
import { pagePreviewContext } from "~/lib/preview-context";
import { publicPageHeaders } from "@dustinedwards/site-runtime/edge-cache";
import { RichText } from "capsomer/react/trusted-html";

// The same for every reader, so the edge stores it (workers/app.ts); admin and Carrel writes purge it.
export const headers = () => publicPageHeaders();

// The welcome and the next-meeting note are edited in Carrel (app/lib/carrel) and stored in D1.
export async function loader({ context }: Route.LoaderArgs) {
  const preview = context.get(pagePreviewContext);
  if (preview?.slug === "home") return preview.page;
  return getDataAccess(context.get(cloudflareContext).env).pages.published("home");
}

export function meta({ matches, loaderData }: Route.MetaArgs) {
  return [
    ...pageHead(matches, {
      path: "/",
      name: loaderData?.title ?? "Texas Branch ASM",
      description:
        loaderData?.description ||
        "The Texas Branch of the American Society for Microbiology: meetings, abstracts, awards and newsletters.",
      fullTitle: true,
      search: loaderData?.searchFields,
    }),
    jsonLd(siteLd()),
  ];
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const rootData = useRouteLoaderData<typeof rootLoader>("root");
  const settings = rootData?.settings;

  return (
    <Stack gap={6}>
      <Title as="h1" size={2}>
        {settings?.orgFullName ?? ""}
      </Title>
      {settings?.tagline ? (
        <Text size="lead" tone="ink" className="cap-measure">
          {settings.tagline}
        </Text>
      ) : null}
      {loaderData ? <RichText className="page-prose" html={loaderData.html} /> : null}
    </Stack>
  );
}
