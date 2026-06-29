import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("officers", "routes/officers.tsx"),
  route("signin", "routes/signin.tsx"),
  route("signout", "routes/signout.tsx"),
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
  route("api/auth/*", "routes/api.auth.$.ts"),
] satisfies RouteConfig;
