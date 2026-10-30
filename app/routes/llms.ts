// /llms.txt from Prelum's llmsResponse: the branch's public hubs and each public meeting's program and abstracts,
// for answer engines. Signed-in and admin pages are left out, as robots.txt leaves them out.
import { llmsResponse } from "@drdustinedwards/site-helpers/llms";
import { getDataAccess } from "~/lib/data-access";
import { FEED_PATH, SITE_ORIGIN } from "~/lib/site-meta";
import { cloudflareContext } from "~/load-context";
import type { Route } from "./+types/llms";

const HUBS = [
  { path: "/meetings", title: "Meetings", description: "Past meetings, their programs, and their abstract archives." },
  { path: "/awardees", title: "Awardees", description: "The branch's named awards and their recipients." },
  { path: "/award-nominations", title: "Award nominations", description: "How to nominate a member for an award." },
  { path: "/branch-officers", title: "Branch officers", description: "Current officers, advisory board, and past officers." },
  { path: "/newsletters", title: "Newsletters", description: "The branch's newsletters." },
  { path: "/trail", title: "Meeting trail", description: "Host cities of the branch meetings since its founding." },
  { path: "/sponsorship", title: "Sponsorship", description: "Sponsoring the meetings and student microbiologists." },
  { path: "/contact", title: "Contact", description: "How to reach the branch." },
  { path: FEED_PATH, title: "RSS feed", description: "New newsletters, abstract books and programs." },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const da = getDataAccess(context.get(cloudflareContext).env);
  const [settings, meetings] = await Promise.all([da.settings.get(), da.editions.listPublic()]);
  return llmsResponse({
    origin: SITE_ORIGIN,
    request,
    title: settings.orgName || "Texas Branch of the American Society for Microbiology",
    summary:
      "The Texas Branch of the American Society for Microbiology: annual meetings, abstracts, awards and newsletters for microbiologists across Texas.",
    intro: ["Citation is welcome. Please cite the Texas Branch ASM and link the page's URL."],
    sections: [
      { heading: "Site", links: HUBS.map((hub) => ({ ...hub, url: `${SITE_ORIGIN}${hub.path}` })) },
      {
        heading: "Meetings",
        links: meetings.flatMap((meeting) => [
          { title: `${meeting.name}: program`, url: `${SITE_ORIGIN}/meetings/${meeting.slug}/program` },
          ...(meeting.abstractCount > 0
            ? [{ title: `${meeting.name}: abstracts`, url: `${SITE_ORIGIN}/meetings/${meeting.slug}/abstracts` }]
            : []),
        ]),
      },
    ],
  });
}
