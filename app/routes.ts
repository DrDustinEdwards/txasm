import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("officers", "routes/officers.tsx"),
  route("signin", "routes/signin.tsx"),
  route("admin", "routes/admin.tsx"),
  route("admin/editions/new", "routes/admin.editions.new.tsx"),
  route("api/auth/*", "routes/api.auth.$.ts"),
] satisfies RouteConfig;
