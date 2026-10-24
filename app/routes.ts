import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
  layout("routes/public.layout.tsx", [
    index("routes/home.tsx"),
    route("branch-officers", "routes/branch-officers.tsx"),
    route("awards", "routes/awards.tsx"),
    route("awards/:slug", "routes/awards.$slug.tsx"),
    route("award-nominations", "routes/award-nominations.tsx"),
    route("awardees", "routes/awardees.tsx"),
    route("newsletters", "routes/newsletters.tsx"),
    route("newsletters/:slug", "routes/newsletters.$slug.tsx"),
    route("archive/:category", "routes/archive.$category.tsx"),
    route("archive/:category/:slug", "routes/archive.$category.$slug.tsx"),
    route("trail", "routes/trail.tsx"),
    route("sponsorship", "routes/sponsorship.tsx"),
    route("contact", "routes/contact.tsx"),
    route("signin", "routes/signin.tsx"),
    route("signout", "routes/signout.tsx"),
    route("account", "routes/account.tsx"),
    route("my/abstracts", "routes/my.abstracts.tsx"),
    route("submit/:slug", "routes/submit.$slug.tsx"),
    route("abstracts/:abstractId/edit", "routes/abstracts.$abstractId.edit.tsx"),
    route("review", "routes/review.tsx"),
    route("review/:assignmentId", "routes/review.$assignmentId.tsx"),
    route("meetings", "routes/meetings.tsx"),
    route("meetings/:slug/program", "routes/meetings.$slug.program.tsx"),
    route("meetings/:slug/abstracts", "routes/meetings.$slug.abstracts.tsx"),
    route(
      "meetings/:slug/abstracts/:ref",
      "routes/meetings.$slug.abstracts.$ref.tsx",
    ),
  ]),
  layout("routes/admin.layout.tsx", [
    route("admin", "routes/admin.tsx"),
    route("admin/settings", "routes/admin.settings.tsx"),
    route("admin/awards", "routes/admin.awards.tsx"),
    route("admin/awards/:slug", "routes/admin.awards.$slug.tsx"),
    route("admin/documents", "routes/admin.documents.tsx"),
    route("admin/officers", "routes/admin.officers.tsx"),
    route("admin/editions/new", "routes/admin.editions.new.tsx"),
    route("admin/editions/:editionId", "routes/admin.editions.$editionId.tsx"),
    route(
      "admin/editions/:editionId/categories",
      "routes/admin.editions.$editionId.categories.tsx",
    ),
    route(
      "admin/editions/:editionId/categories/:categoryId",
      "routes/admin.editions.$editionId.categories.$categoryId.tsx",
    ),
    route(
      "admin/editions/:editionId/abstract-categories",
      "routes/admin.editions.$editionId.abstract-categories.tsx",
    ),
    route(
      "admin/editions/:editionId/roles",
      "routes/admin.editions.$editionId.roles.tsx",
    ),
    route(
      "admin/editions/:editionId/review",
      "routes/admin.editions.$editionId.review.tsx",
    ),
    route(
      "admin/editions/:editionId/review/:abstractId",
      "routes/admin.editions.$editionId.review.$abstractId.tsx",
    ),
    route(
      "admin/editions/:editionId/decisions",
      "routes/admin.editions.$editionId.decisions.tsx",
    ),
    route(
      "admin/editions/:editionId/book",
      "routes/admin.editions.$editionId.book.tsx",
    ),
    route(
      "admin/editions/:editionId/program",
      "routes/admin.editions.$editionId.program.tsx",
    ),
    route(
      "admin/editions/:editionId/speakers",
      "routes/admin.editions.$editionId.speakers.tsx",
    ),
    route(
      "admin/editions/:editionId/sponsors",
      "routes/admin.editions.$editionId.sponsors.tsx",
    ),
  ]),
  // Resource routes: full-document HTML / streamed PDF, no shell chrome.
  route(
    "admin/editions/:editionId/book/preview",
    "routes/admin.editions.$editionId.book.preview.tsx",
  ),
  route(
    "admin/editions/:editionId/book/download",
    "routes/admin.editions.$editionId.book.download.tsx",
  ),
  route(
    "admin/editions/:editionId/program-document/download",
    "routes/admin.editions.$editionId.program-document.download.tsx",
  ),
  route("documents/:slug/inline", "routes/documents.$slug.inline.ts"),
  route("documents/:slug/download", "routes/documents.$slug.download.ts"),
  route("api/institutions", "routes/api.institutions.ts"),
  route("api/awards-search", "routes/api.awards-search.ts"),
  route("api/abstracts-search", "routes/api.abstracts-search.ts"),
  route("api/auth/*", "routes/api.auth.$.ts"),
  route("health", "routes/health.ts"),
] satisfies RouteConfig;
