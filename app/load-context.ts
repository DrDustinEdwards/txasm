import { createContext } from "react-router";

// Cloudflare bindings and execution context, injected per request in
// workers/app.ts and read in loaders and actions. Hard rule 1: D1, R2, KV, and
// Browser Rendering are reached only through here, never over HTTP and never via
// a Node-only API.
//
// React Router v8 replaced the v7 getLoadContext object (the old
// context.cloudflare.env shape) with this typed context provider: set it in the
// worker, read it with context.get(cloudflareContext) in loaders and actions.
export interface CloudflareContext {
  env: Env;
  ctx: ExecutionContext;
}

export const cloudflareContext = createContext<CloudflareContext>();
