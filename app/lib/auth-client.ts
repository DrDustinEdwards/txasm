// Better Auth in the browser: the passkey prompts and the passkey list, with the
// family's sign-in plugins (site-runtime ./sign-in-client) so the client offers
// what the server does.
import { createAuthClient } from "better-auth/client";
import { signInClientPlugins } from "@dustinedwards/site-runtime/sign-in-client";

export const authClient = createAuthClient({ plugins: signInClientPlugins() });
