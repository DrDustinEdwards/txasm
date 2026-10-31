// The single transactional email helper. Server-only. It may read env but does
// not import the schema or the Drizzle client, so it stays outside the data
// boundary. The provider is Cloudflare Email Service (Email Sending) via the
// native send_email binding, env.SEND_EMAIL.
//
// Dormant until cutover: the binding is commented out in wrangler.jsonc and
// EMAIL_ENABLED defaults off, so isEmailConfigured is false and sendEmail logs
// that a message would have gone instead of sending. It never throws for being
// unconfigured.
// Turning it on later is a config change (uncomment the binding, set
// EMAIL_ENABLED), not a code change.

import { escapeHtml } from "@dustinedwards/site-runtime/html";
import { logEvent } from "@dustinedwards/site-runtime/log";
import { SIGN_IN_EXPIRES_IN_WORDS, type NoticeDetail } from "@dustinedwards/site-runtime/sign-in";
import { type Template, magicLink, renderEmail, securityNotice } from "capsomer/email";
import { extractPlainText } from "./richtext";

// The send_email binding shape we use, per the Cloudflare Email Sending API. It
// is declared here because the binding is commented out in wrangler.jsonc, so
// the generated Env type does not include it yet.
interface SendEmailMessage {
  to: Array<{ email: string }>;
  from: { email: string; name: string };
  subject: string;
  text: string;
  html?: string;
}
interface SendEmailBinding {
  send(message: SendEmailMessage): Promise<{ id?: string } | void>;
}

type EmailEnv = {
  EMAIL_ENABLED?: string;
  EMAIL_FROM?: string;
  EMAIL_FROM_NAME?: string;
  SEND_EMAIL?: SendEmailBinding;
};

// Read the email-related config off env without depending on the generated type
// (SEND_EMAIL is not in it while the binding is commented out).
function emailEnv(env: Env): EmailEnv {
  return env as unknown as EmailEnv;
}

function flagOn(value: string | undefined): boolean {
  const v = value?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

export interface EmailContent {
  subject: string;
  text: string;
  html?: string;
}

export interface SendResult {
  sent: boolean;
  id?: string;
  reason?: string;
}

// Configured only when the flag is on, the binding exists, and a from address is
// set. All three are true only after cutover.
function isEmailConfigured(env: Env): boolean {
  const e = emailEnv(env);
  return (
    flagOn(e.EMAIL_ENABLED) &&
    !!e.SEND_EMAIL &&
    typeof e.EMAIL_FROM === "string" &&
    e.EMAIL_FROM.trim().length > 0
  );
}

// Each secret (a sign-in link, its token, its code) cut out of a logged error.
function redact(line: string, secrets: readonly string[]): string {
  return secrets.reduce((out, secret) => (secret ? out.split(secret).join("[redacted]") : out), line);
}

export async function sendEmail(
  env: Env,
  message: { to: string; subject: string; text: string; html?: string },
  options: { secrets?: readonly string[] } = {},
): Promise<SendResult> {
  const e = emailEnv(env);
  const secrets = options.secrets ?? [];

  if (!isEmailConfigured(env)) {
    // Dormant: log only that a message would have gone, never its body, which
    // can hold a sign-in link and code (Workers Logs keep every line).
    console.log(`[email:dormant] not sent, mail is off: ${message.subject}`);
    return { sent: false, reason: "disabled" };
  }

  try {
    const from = {
      email: e.EMAIL_FROM!.trim(),
      name: (e.EMAIL_FROM_NAME ?? "TXASM").trim() || "TXASM",
    };
    const result = await e.SEND_EMAIL!.send({
      to: [{ email: message.to }],
      from,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    const id =
      result && typeof result === "object" && "id" in result
        ? result.id
        : undefined;
    return { sent: true, id };
  } catch (error) {
    const reason = redact(error instanceof Error ? error.message : "send failed", secrets);
    logEvent("email_send_failed", { reason }, { level: "error" });
    return { sent: false, reason };
  }
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
// approve the change, then to the new one, to confirm it. Capsomer's blocks in a template of the
// site's own, since its verification template says a link works once and Better Auth's works until
// it expires. Each link opens the site's confirm page; sendEmail is given it to cut out of a logged
// send error.
const emailChange: Template<{ url: string; step: "current" | "new"; newEmail?: string }> = {
  name: "email-change",
  subject: (d) =>
    d.step === "current" ? "Approve the change to your TXASM email address" : "Confirm your new TXASM email address",
  blocks: (d) =>
    d.step === "current"
      ? [
          { type: "heading", text: "Approve the email change" },
          {
            type: "paragraph",
            text: `Someone asked to change your TXASM account's email address to ${d.newEmail}. If it was you, approve it here, then confirm from the new address.`,
          },
          { type: "button", label: "Approve the change", url: d.url },
          { type: "fine", text: "The link expires in 1 hour." },
          {
            type: "fine",
            text: "If this was not you, ignore this email and your address stays as it is. Then sign in and check your passkeys and signed-in devices.",
          },
        ]
      : [
          { type: "heading", text: "Confirm your new email address" },
          { type: "paragraph", text: "Confirm this address to finish moving your TXASM account to it. Sign-in links will come here." },
          { type: "button", label: "Confirm this address", url: d.url },
          { type: "fine", text: "The link expires in 1 hour." },
          { type: "fine", text: "If you did not ask for this, ignore this email." },
        ],
};

export function emailChangeEmail(to: string, url: string, step: "current" | "new", newEmail?: string): EmailContent {
  return renderEmail(emailChange, { brand: BRAND, to, url, step, newEmail });
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

