import { createRequestHandler, RouterContextProvider } from "react-router";
import { cloudflareContext } from "../app/load-context";
import { runNightlyBackup } from "../app/lib/backup.server";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request, env, ctx) {
    // Inject the Cloudflare env and execution context so loaders and actions
    // reach bindings through context.get(cloudflareContext), never ambiently.
    const context = new RouterContextProvider();
    context.set(cloudflareContext, { env, ctx });
    return requestHandler(request, context);
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
