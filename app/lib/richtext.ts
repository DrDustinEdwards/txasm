// Inline formatting allowlist for abstract text. The title allows italic only;
// the structured sections also allow superscript and subscript. Nothing else:
// no bold, links, lists, images, colors, tables, or attributes. The server runs
// this on every save, so client input is never trusted. No dependencies: a small
// allowlist tokenizer does the job.

export const TITLE_TAGS = ["em"] as const;
export const BODY_TAGS = ["em", "sup", "sub"] as const;

type Token =
  | { type: "text"; value: string }
  | { type: "open"; tag: string }
  | { type: "close"; tag: string };

const TAG_RE = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?>/g;

// Escape stray &, <, > in literal text without double-escaping existing entity
// references (so &amp; from a browser's innerHTML survives intact).
function escapeText(text: string): string {
  return text
    .split(/(&(?:#\d+|#x[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);)/)
    .map((part, i) => {
      if (i % 2 === 1) return part; // an entity reference, keep as-is
      return part
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    })
    .join("");
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  const cleaned = input.replace(/<!--[\s\S]*?-->/g, "");
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  TAG_RE.lastIndex = 0;
  while ((match = TAG_RE.exec(cleaned)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({
        type: "text",
        value: cleaned.slice(lastIndex, match.index),
      });
    }
    const raw = match[0];
    const tag = match[1].toLowerCase();
    tokens.push(
      raw.startsWith("</") ? { type: "close", tag } : { type: "open", tag },
    );
    lastIndex = match.index + raw.length;
  }
  if (lastIndex < cleaned.length) {
    tokens.push({ type: "text", value: cleaned.slice(lastIndex) });
  }
  return tokens;
}

// Keep only the allowed tags (no attributes), strip everything else to plain
// text, and return well-formed, balanced HTML.
export function sanitizeRichText(
  input: string,
  allowed: readonly string[],
): string {
  if (!input) return "";
  // Drop C0 control characters (NUL and friends), keeping tab, newline, and
  // carriage return. These are invalid in stored text and, left in, break tools
  // that consume the value as SQL text (a NUL byte from a mangled paste or a bad
  // upstream parse would otherwise survive to the database).
  const controlStripped = input.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  const allow = new Set(allowed);
  const tokens = tokenize(controlStripped);
  const out: string[] = [];
  const stack: string[] = [];

  for (const token of tokens) {
    if (token.type === "text") {
      out.push(escapeText(token.value));
      continue;
    }
    if (token.type === "open") {
      if (!allow.has(token.tag)) continue; // drop tag, keep inner text
      stack.push(token.tag);
      out.push(`<${token.tag}>`);
      continue;
    }
    // close tag
    if (!allow.has(token.tag)) continue;
    const idx = stack.lastIndexOf(token.tag);
    if (idx === -1) continue; // stray close, ignore
    // close inner tags opened after this one, close this one, then reopen inner
    for (let i = stack.length - 1; i >= idx; i--) out.push(`</${stack[i]}>`);
    const reopen = stack.slice(idx + 1);
    stack.length = idx;
    for (const t of reopen) {
      stack.push(t);
      out.push(`<${t}>`);
    }
  }
  for (let i = stack.length - 1; i >= 0; i--) out.push(`</${stack[i]}>`);
  return out.join("").trim();
}

export function sanitizeTitle(input: string): string {
  return sanitizeRichText(input, TITLE_TAGS);
}

export function sanitizeBody(input: string): string {
  return sanitizeRichText(input, BODY_TAGS);
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

// Plain text from sanitized HTML, for word and character counting.
export function extractPlainText(html: string): string {
  const noTags = html.replace(/<[^>]*>/g, "");
  return noTags.replace(
    /&(?:amp|lt|gt|quot|apos|nbsp|#39);/g,
    (match) => ENTITIES[match] ?? match,
  );
}

export function countWords(html: string): number {
  const text = extractPlainText(html).trim();
  return text ? text.split(/\s+/).length : 0;
}

export function isEmptyRichText(html: string): boolean {
  return extractPlainText(html).trim().length === 0;
}
