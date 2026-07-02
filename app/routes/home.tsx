import { useRouteLoaderData } from "react-router";
import type { Route } from "./+types/home";
import type { loader as rootLoader } from "~/root";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Texas Branch ASM" },
    {
      name: "description",
      content:
        "The Texas Branch of the American Society for Microbiology. Meetings, abstracts, and member news.",
    },
  ];
}

export default function Home() {
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
      <p className="text-gray-600 dark:text-gray-400">
        We bring Texas microbiologists together twice a year to share research,
        mentor students, and recognize the best work in the field. Registration,
        abstract submission, and the meeting program all live here.
      </p>
      <p className="text-gray-600 dark:text-gray-400">
        Details for the next meeting are on the way. Check back soon, or see the
        people who run the branch.
      </p>
    </div>
  );
}
