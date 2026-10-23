import { createRequestHandler, RouterContextProvider } from "react-router";
import { cloudflareContext } from "../app/load-context";
import { runNightlyBackup } from "../app/lib/backup.server";
import { withSecurityHeaders } from "../app/lib/security-headers";
import { carrelApi } from "../app/lib/carrel/handler.server";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request, env, ctx) {
    // Carrel's site API. Its own guard (prefix, rate limit, key, route) runs first and answers
    // everything under /api/carrel/v1; nothing else is served by it.
    const carrel = carrelApi(env);
    if (carrel.matches(request)) return withSecurityHeaders(await carrel.handle(request));

    // Inject the Cloudflare env and execution context so loaders and actions
    // reach bindings through context.get(cloudflareContext), never ambiently.
    const context = new RouterContextProvider();
    context.set(cloudflareContext, { env, ctx });
    return withSecurityHeaders(await requestHandler(request, context));
  },

  // The cron fires daily (see wrangler.jsonc). It takes the nightly D1 backup;
  // the deadline jobs and reminders (submission and review deadline reminders,
  // status transitions) are wired per edition in a later phase. A failed backup
  // throws so the run shows as failed in Workers Logs.
  async scheduled(controller, env, _ctx) {
    console.log(
      `[cron] tick ${controller.cron} at ${new Date(controller.scheduledTime).toISOString()}`,
    );
    await runNightlyBackup(env);
  },
} satisfies ExportedHandler<Env>;
