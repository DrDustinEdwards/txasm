import { createRequestHandler, RouterContextProvider } from "react-router";
import { cloudflareContext } from "../app/load-context";

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

  // Deadline jobs and reminders. The cron fires daily (see wrangler.jsonc); the
  // real work (submission and review deadline reminders, status transitions) is
  // wired per edition in a later phase. Stubbed so the schedule is live now.
  async scheduled(controller, _env, _ctx) {
    console.log(
      `[cron] tick ${controller.cron} at ${new Date(controller.scheduledTime).toISOString()}`,
    );
  },
} satisfies ExportedHandler<Env>;
