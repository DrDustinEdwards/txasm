// Better Auth in the browser: the passkey prompts and the passkey list, with the
// family's sign-in plugins (site-runtime ./sign-in-client) so the client offers
// what the server does.
import { createAuthClient } from "better-auth/client";
import { signInClientPlugins, signalPasskeys } from "@dustinedwards/site-runtime/sign-in-client";

export const authClient = createAuthClient({ plugins: signInClientPlugins() });

// After a passkey sign-in: tell the password manager which of this account's passkeys the site still
// accepts and the address they belong to (the WebAuthn Signal API, where the browser has it). Never
// stops the sign-in.
export async function signalAfterPasskeySignIn(): Promise<void> {
  try {
    const [passkeys, session] = await Promise.all([authClient.passkey.listUserPasskeys(), authClient.getSession()]);
    const email = session.data?.user.email;
    if (!passkeys.data || !email) return;
    await signalPasskeys({ credentialIds: passkeys.data.map((p) => p.credentialID), name: email });
  } catch {
    // The signal is a courtesy to the password manager; the person is signed in either way.
  }
}
