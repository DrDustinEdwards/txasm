import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("officers", "routes/officers.tsx"),
  route("signin", "routes/signin.tsx"),
  route("signout", "routes/signout.tsx"),
  route("my/abstracts", "routes/my.abstracts.tsx"),
  route("submit/:slug", "routes/submit.$slug.tsx"),
  route("abstracts/:abstractId/edit", "routes/abstracts.$abstractId.edit.tsx"),
  route("admin", "routes/admin.tsx"),
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
    "admin/editions/:editionId/book/preview",
    "routes/admin.editions.$editionId.book.preview.tsx",
  ),
  route(
    "admin/editions/:editionId/program",
    "routes/admin.editions.$editionId.program.tsx",
  ),
  route("review", "routes/review.tsx"),
  route("review/:assignmentId", "routes/review.$assignmentId.tsx"),
  route("meetings/:slug/program", "routes/meetings.$slug.program.tsx"),
  route("api/auth/*", "routes/api.auth.$.ts"),
] satisfies RouteConfig;
