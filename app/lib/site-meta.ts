import type { PlatformSettings } from "./data-access";

// Route meta runs without the page's own loader data on these static content
// pages, but the root loader (settings) is always in the matches chain. Pull the
// org short name from there so page titles track the settings value instead of
// hardcoding the branch name in every route. Type-only import, erased at build.
type RootMatch = { id: string; data?: { settings?: PlatformSettings } };

export function pageTitle(
  matches: ReadonlyArray<{ id: string } | undefined>,
  pageName: string,
): string {
  const root = (matches as ReadonlyArray<RootMatch | undefined>).find(
    (match) => match?.id === "root",
  );
  const shortName = root?.data?.settings?.shortName ?? "";
  return shortName ? `${pageName} | ${shortName}` : pageName;
}
