import type { Route } from "./+types/officers";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Officers | Texas Branch ASM" },
    {
      name: "description",
      content:
        "Current officers of the Texas Branch of the American Society for Microbiology.",
    },
  ];
}

export default function Officers() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">Officers</h1>
      <p className="max-w-2xl text-gray-700 dark:text-gray-300">
        The branch is run by elected officers and volunteers from member
        institutions across Texas. The current roster will be listed here.
      </p>
    </div>
  );
}
