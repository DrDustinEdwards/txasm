// Tags and alt text a model suggests for a library picture (site-api v0.13.0, mediaSuggestions). Workers AI,
// through Cloudflare AI Gateway when the site has one. Nothing here writes: a suggestion reaches the file only when
// an editor accepts it in Carrel, as an alt or a tags write. Only pictures an editor uploaded are sent, never a
// visitor's data, and only when an editor asks. dustinedwards.info's suggest.server.ts, with txasm's prompt.

import { anthropicRoute } from "@dustinedwards/site-runtime/ai-gateway";
import { editImage } from "@dustinedwards/site-runtime/image";
import { toBase64 } from "@dustinedwards/site-runtime/encoding";

/** The vision model: natively multimodal, Cloudflare-hosted, with no license prompt to accept first. */
export const SUGGEST_MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";

/** The longest edge the model is shown: enough to name what is in a picture, and a small request. */
const VIEW_EDGE = 768;

/** Carrel's rule for alt text: what is in the picture, plainly, and nothing more. */
const PROMPT = [
  "You write alt text and library tags for one picture on the website of a scientific society, the Texas Branch of",
  "the American Society for Microbiology.",
  'Answer with JSON only, in this shape: {"alt": "...", "tags": ["...", "..."]}.',
  "alt: one plain sentence, at most 25 words, describing what the picture shows: the subject, what it is doing,",
  "and any text that is legible in it. Say only what can be seen. Do not begin with 'Image of', 'Picture of' or",
  "'Photo of'. Do not interpret, praise or guess at feelings, names or places that are not written in the picture.",
  "tags: three to eight short lower case nouns for what is in the picture, words joined by hyphens, no duplicates.",
].join(" ");

type SuggestEnv = Pick<Env, "IMAGES" | "AI"> & { AI_GATEWAY_BASE_URL?: string };

/**
 * The gateway Workers AI runs through: its id from AI_GATEWAY_BASE_URL, the URL site-runtime's ./ai-gateway checks
 * (`.../v1/{account_id}/{gateway_id}/anthropic`), with that module's policy: bodies not logged, the site named on
 * each log entry. Undefined when the site has no gateway: the call goes to Workers AI directly.
 */
function suggestGateway(env: { AI_GATEWAY_BASE_URL?: string }): GatewayOptions | undefined {
  const route = anthropicRoute({ AI_GATEWAY_BASE_URL: env.AI_GATEWAY_BASE_URL }, "txasm");
  if (!route.gateway) return undefined;
  const id = /\/v1\/[^/]+\/([^/]+)\/anthropic$/.exec(route.baseURL)?.[1];
  if (!id) throw new Error("AI_GATEWAY_BASE_URL names no gateway id; set it to https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/anthropic");
  return { id, collectLog: false, metadata: { app: "txasm" } };
}

/** A smaller copy of the picture as a data: URI, for the model to look at. */
async function viewOf(env: SuggestEnv, body: ReadableStream): Promise<string> {
  const response = await editImage(env.IMAGES, body, { maxEdge: VIEW_EDGE, format: "image/jpeg", quality: 80 });
  return `data:image/jpeg;base64,${toBase64(new Uint8Array(await response.arrayBuffer()))}`;
}

/** The model's answer as tags and alt, from its JSON, wherever in the text it put it. */
function readSuggestion(answer: unknown): { tags: string[]; alt: string | null } {
  const body = typeof answer === "object" && answer !== null && "response" in answer ? (answer as { response: unknown }).response : answer;
  let parsed: unknown = body;
  if (typeof body === "string") {
    const json = /\{[\s\S]*\}/.exec(body)?.[0];
    try {
      parsed = json ? JSON.parse(json) : null;
    } catch {
      parsed = null;
    }
  }
  const record = (parsed ?? {}) as { alt?: unknown; tags?: unknown };
  const alt = typeof record.alt === "string" && record.alt.trim() ? record.alt.trim() : null;
  const tags = Array.isArray(record.tags) ? record.tags.filter((t): t is string => typeof t === "string") : [];
  return { tags, alt };
}

/** What the model suggests for one stored picture. */
export async function suggestFor(env: SuggestEnv, body: ReadableStream): Promise<{ tags: string[]; alt: string | null; model: string }> {
  const image = await viewOf(env, body);
  const gateway = suggestGateway(env);
  const answer = await env.AI.run(
    SUGGEST_MODEL as keyof AiModels,
    {
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: PROMPT },
            { type: "image_url", image_url: { url: image } },
          ],
        },
      ],
      max_tokens: 300,
      temperature: 0.2,
    } as never,
    gateway ? { gateway } : {},
  );
  return { ...readSuggestion(answer), model: SUGGEST_MODEL };
}
