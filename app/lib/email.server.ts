// The single transactional email helper. Server-only. It may read env but does
// not import the schema or the Drizzle client, so it stays outside the data
// boundary. The provider is Cloudflare Email Service (Email Sending) via the
// native send_email binding, env.SEND_EMAIL.
//
// Dormant until cutover: the binding is commented out in wrangler.jsonc and
// EMAIL_ENABLED defaults off, so isEmailConfigured is false and sendEmail logs
// the message instead of sending. It never throws for being unconfigured.
// Turning it on later is a config change (uncomment the binding, set
// EMAIL_ENABLED), not a code change.

import { escapeHtml } from "@dustinedwards/site-runtime/html";
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

export async function sendEmail(
  env: Env,
  message: { to: string; subject: string; text: string; html?: string },
): Promise<SendResult> {
  const e = emailEnv(env);

  if (!isEmailConfigured(env)) {
    // Dormant: log what would have gone out (mirrors the pre-cutover magic-link
    // behavior) and report not sent, without throwing.
    console.log(`[email:dormant] would send to ${message.to}: ${message.subject}`);
    console.log(message.text);
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
    const reason = error instanceof Error ? error.message : "send failed";
    console.error(`[email] send to ${message.to} failed: ${reason}`);
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

export function magicLinkEmail(url: string): EmailContent {
  const subject = "Your TXASM sign-in link";
  const lines = [
    "Use the link below to sign in to TXASM. It expires in a few minutes.",
    url,
    "If you did not request this, you can ignore this email.",
  ];
  const text = lines.join("\n\n");
  const html = `${htmlParagraphs([lines[0]])}<p><a href="${escapeHtml(
    url,
  )}">${escapeHtml(url)}</a></p>${htmlParagraphs([lines[2]])}`;
  return { subject, text, html };
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

