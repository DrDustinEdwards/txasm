// The site's mail: the templates below, sent by site-runtime's ./email over Cloudflare Email Service's send_email
// binding (env.SEND_EMAIL). Server-only; it reads env but not the schema or the Drizzle client, so it stays outside the
// data boundary.
//
// Dormant until cutover: the binding is commented out in wrangler.jsonc and EMAIL_ENABLED defaults off, so sendEmail
// hands ./email no binding and the send comes back not_configured, logged without its body. Turning it on later is a
// config change (uncomment the binding, set EMAIL_ENABLED), not a code change.

import { escapeHtml } from "@dustinedwards/site-runtime/html";
import { type Mail, type SendOutcome, sendEmail as send } from "@dustinedwards/site-runtime/email";
import { SIGN_IN_EXPIRES_IN_WORDS, type NoticeDetail } from "@dustinedwards/site-runtime/sign-in";
import { emailChange, magicLink, renderEmail, securityNotice } from "capsomer/email";
import { extractPlainText } from "./richtext";

// The email config, read off env without the generated type: SEND_EMAIL is not in it while the binding is commented out.
type EmailEnv = { EMAIL_ENABLED?: string; EMAIL_FROM?: string; EMAIL_FROM_NAME?: string; SEND_EMAIL?: SendEmail };

export interface EmailContent {
  subject: string;
  text: string;
  html?: string;
}

/** One mail from the site's address, once EMAIL_ENABLED is on; each of `secrets` is cut out of a logged error. */
export function sendEmail(
  env: Env,
  message: Omit<Mail, "from">,
  options: { secrets?: readonly string[] } = {},
): Promise<SendOutcome> {
  const e = env as unknown as EmailEnv;
  const on = ["1", "true", "on", "yes"].includes(e.EMAIL_ENABLED?.trim().toLowerCase() ?? "");
  const from = { email: e.EMAIL_FROM ?? "", name: e.EMAIL_FROM_NAME?.trim() || "TXASM" };
  return send(on ? e.SEND_EMAIL : undefined, { ...message, from }, options);
}

// ---------------------------------------------------------------------------
// Template builders. Pure functions returning EmailContent. Plain professional
// copy, no secrets. Plain-text fields that may carry stored HTML are stripped
// with extractPlainText.
// ---------------------------------------------------------------------------

function htmlParagraphs(lines: string[]): string {
  return lines
    .filter((line) => line.length > 0)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");
}

// The site's name and colors on Capsomer's mail templates.
const BRAND = { name: "TXASM", family: "navy" } as const;

// The sign-in mail (site-runtime ./sign-in) on Capsomer's magic-link template:
// Better Auth's link untouched and the six-digit code as text, for the tab that
// asked when the link opens in another browser (the mail app's, a phone). Both
// sign in, so sendEmail is given them to cut out of a logged send error.
// Capsomer refuses a link that is not https, so it throws on a local http URL.
export function magicLinkEmail(to: string, url: string, code: string): EmailContent {
  return renderEmail(magicLink, {
    brand: BRAND,
    to,
    url,
    code,
    expiresIn: SIGN_IN_EXPIRES_IN_WORDS,
    copy: { subject: "Your TXASM sign-in link" },
  });
}

// A security notice (site-runtime ./sign-in, sendSecurityNotice) on Capsomer's template: what changed, when,
// from which device, and a button to the account page. It holds no link that signs in.
export function securityNoticeEmail(to: string, detail: NoticeDetail, url: string): EmailContent {
  return renderEmail(securityNotice, { brand: BRAND, to, ...detail, url });
}

// The two mails of an email change (app/lib/auth.server.ts): first to the current address, to
// approve the change, then to the new one, to confirm it. Capsomer's emailChange template; each
// link opens the site's confirm page, and sendEmail is given it to cut out of a logged send error.
export function emailChangeEmail(
  to: string,
  url: string,
  step: "current" | "new",
  newEmail: string | undefined,
  expiresIn: string,
): EmailContent {
  return renderEmail(emailChange, { brand: BRAND, to, url, step, newEmail, expiresIn });
}

function presentationLabel(value: "oral" | "poster"): string {
  return value === "oral" ? "Oral" : "Poster";
}

export function decisionEmail(input: {
  meetingName: string;
  title: string;
  outcome: "accept" | "reject" | "revise";
  presentationType?: "oral" | "poster" | null;
  message?: string | null;
}): EmailContent {
  const meeting = input.meetingName;
  const title = extractPlainText(input.title).trim() || "your abstract";

  let lead: string;
  if (input.outcome === "accept") {
    lead = `Your abstract "${title}" has been accepted for ${meeting}.`;
  } else if (input.outcome === "reject") {
    lead = `After review, your abstract "${title}" was not accepted for ${meeting}.`;
  } else {
    lead = `The reviewers have requested revisions to your abstract "${title}" for ${meeting}.`;
  }

  const lines: string[] = [lead];
  if (input.outcome === "accept" && input.presentationType) {
    lines.push(`Presentation type: ${presentationLabel(input.presentationType)}.`);
  }
  const message = input.message
    ? extractPlainText(input.message).trim()
    : "";
  if (message) {
    lines.push("Message from the organizers:");
    lines.push(message);
  }
  lines.push("Sign in to TXASM to see the full decision.");
  lines.push("Texas Branch ASM");

  return {
    subject: `Decision on your abstract for ${meeting}`,
    text: lines.join("\n\n"),
    html: htmlParagraphs(lines),
  };
}

