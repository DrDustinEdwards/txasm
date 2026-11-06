// A multipart/form-data body read as it arrives, one part at a time, so a large file goes on to R2 without the whole
// request held in memory (request.formData() would buffer every byte of it). Read each part's body before asking for
// the next; what is left of a part is skipped. Over `maxBytes` in all, the read throws a 413, as readForm does.
import { ValidationError } from "./data-access";

export interface MultipartPart {
  name: string;
  /** The file name for a file part ("" when the picker was left empty), null for a text field. */
  filename: string | null;
  type: string;
  /** The part's bytes. Each call goes on from where the last stopped, so a reader may break out and call again. */
  chunks(): AsyncGenerator<Uint8Array>;
}

const CRLF2 = new Uint8Array([13, 10, 13, 10]);
const HEADER_LIMIT = 16 * 1024;

function indexOf(haystack: Uint8Array, needle: Uint8Array): number {
  const last = haystack.length - needle.length;
  // The native indexOf jumps to each candidate first byte, so a 50 MB file is scanned at native speed.
  for (let i = haystack.indexOf(needle[0]); i !== -1 && i <= last; i = haystack.indexOf(needle[0], i + 1)) {
    let j = 1;
    while (j < needle.length && haystack[i + j] === needle[j]) j++;
    if (j === needle.length) return i;
  }
  return -1;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}

const malformed = () => new ValidationError("Could not read the upload. Try again.");

/** The boundary from a multipart/form-data Content-Type, or null for any other type. */
export function multipartBoundary(contentType: string | null): string | null {
  if (!contentType || !/^multipart\/form-data\s*;/i.test(contentType)) return null;
  const match = /;\s*boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType);
  return match ? (match[1] ?? match[2]) : null;
}

export async function* multipartParts(
  body: ReadableStream<Uint8Array> | null,
  boundary: string,
  maxBytes: number,
): AsyncGenerator<MultipartPart> {
  if (!body) throw malformed();
  const reader = body.getReader();
  const delimiter = new TextEncoder().encode(`\r\n--${boundary}`);
  // A leading CRLF lets the first boundary match the same delimiter as the rest.
  let buf: Uint8Array = new Uint8Array([13, 10]);
  let total = 0;

  async function more(): Promise<void> {
    const { done, value } = await reader.read();
    if (done) throw malformed();
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Response("Payload Too Large", { status: 413, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
    }
    buf = buf.length ? concat(buf, value) : value;
  }

  async function find(needle: Uint8Array): Promise<number> {
    for (;;) {
      const at = indexOf(buf, needle);
      if (at >= 0) return at;
      if (buf.length > HEADER_LIMIT) throw malformed();
      await more();
    }
  }

  try {
    const first = await find(delimiter); // before reading buf: find may grow it
    buf = buf.subarray(first + delimiter.length);
    for (;;) {
      while (buf.length < 2) await more();
      if (buf[0] === 45 && buf[1] === 45) return; // "--": the closing boundary
      const end = await find(CRLF2);
      const headers = new TextDecoder().decode(buf.subarray(2, Math.max(2, end)));
      buf = buf.subarray(end + 4);
      const disposition = /^content-disposition:(.*)$/im.exec(headers)?.[1] ?? "";
      const name = /\bname="([^"]*)"/i.exec(disposition)?.[1];
      if (name === undefined) throw malformed();
      const filename = /\bfilename="([^"]*)"/i.exec(disposition)?.[1] ?? null;
      const type = /^content-type:\s*([^;\r\n]*)/im.exec(headers)?.[1].trim().toLowerCase() ?? "";

      let finished = false;
      // Bytes go out as they come, all but a delimiter's length, which may be the start of the next boundary.
      const chunks = async function* (): AsyncGenerator<Uint8Array> {
        while (!finished) {
          const at = indexOf(buf, delimiter);
          if (at >= 0) {
            const last = buf.subarray(0, at);
            buf = buf.subarray(at + delimiter.length);
            finished = true;
            if (last.length) yield last;
            return;
          }
          const keep = delimiter.length - 1;
          if (buf.length > keep) {
            const out = buf.subarray(0, buf.length - keep);
            buf = buf.slice(buf.length - keep);
            yield out;
          }
          await more();
        }
      };
      yield { name, filename, type, chunks };
      for await (const _ of chunks()) {
        // skip what the caller left unread
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** A text field's value, read to at most `max` bytes. */
export async function partText(part: MultipartPart, max = 64 * 1024): Promise<string> {
  let bytes: Uint8Array = new Uint8Array(0);
  for await (const chunk of part.chunks()) {
    bytes = concat(bytes, chunk);
    if (bytes.length > max) throw new ValidationError(`The ${part.name} field is too long.`);
  }
  return new TextDecoder().decode(bytes);
}
