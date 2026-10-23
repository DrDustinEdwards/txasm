import { useEffect, useRef } from "react";
import { Form, Link, useActionData, useNavigation, useSearchParams } from "react-router";
import type { Route } from "./+types/admin.editions.$editionId.program";
import { pageTitle } from "~/lib/site-meta";
import { cloudflareContext } from "~/load-context";
import { requireChair } from "~/lib/auth.server";
import {
  AlreadyExistsError,
  getDataAccess,
  NotFoundError,
  type ProgramItemKind,
  ValidationError,
} from "~/lib/data-access";
import { renderProgramBook } from "~/lib/program-book";
import { renderBookPdf } from "~/lib/book-pdf.server";
import { ProgramDocumentPanel } from "~/components/program-builder/document-panel";
import { SessionFields, Slot } from "~/components/program-builder/sessions";
import { buildDayKeys, dayTabLabel } from "~/components/program-builder/shared";
import { NO_DATE_KEY, PDF_MIME_TYPE } from "~/lib/vocab";

export function meta({ matches }: Route.MetaArgs) {
  return [{ title: pageTitle(matches, "Program") }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { actor } = await requireChair(request, params.editionId);
  const { env } = context.get(cloudflareContext);
  const da = getDataAccess(env);
  const edition = await da.editions.getById(actor, params.editionId);
  const schedule = await da.programSessions.getScheduleForEdition(actor, params.editionId);
  const unplaced = await da.programItems.listUnplacedAbstracts(actor, params.editionId);
  const speakerRows = await da.invitedSpeakers.listForEdition(actor, params.editionId);
  const speakers = speakerRows.map((s) => ({
    id: s.id,
    name: s.name,
    role: s.role,
    talkTitle: s.talkTitle,
  }));
  const document = await da.documents.getGeneratedForEdition(actor, params.editionId, "program");
  return {
    edition: { id: edition.id, name: edition.name },
    schedule,
    unplaced,
    speakers,
    document,
  };
}

function parseKind(value: FormDataEntryValue | null): ProgramItemKind | undefined {
  const raw = String(value ?? "").trim();
  return raw ? (raw as ProgramItemKind) : undefined;
}

function parseWhen(value: FormDataEntryValue | null): Date | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const { actor } = await requireChair(request, params.editionId);
  const { env } = context.get(cloudflareContext);
  const da = getDataAccess(env);
  const editionId = params.editionId;
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  // Publish the generated program document to public.
  if (intent === "document-publish") {
    try {
      await da.documents.publish(actor, String(form.get("documentId") ?? ""));
      return { ok: "The program is published." };
    } catch (error) {
      if (error instanceof ValidationError) return { error: error.message };
      throw error;
    }
  }

  // Generate the program PDF only on this explicit intent, never on load. Runs
  // Browser Rendering, so it is its own path with its own error handling.
  if (intent === "document-generate") {
    let generatingId: string;
    try {
      const claim = await da.documents.recordGenerating(actor, {
        editionId,
        category: "program",
      });
      generatingId = claim.id;
    } catch (error) {
      if (error instanceof ValidationError) return { error: error.message };
      throw error;
    }
    try {
      const data = await da.program.getProgramData(actor, editionId);
      const html = renderProgramBook(data);
      const bytes = await renderBookPdf(html, env);

      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const r2Key = `editions/${editionId}/program-${stamp}.pdf`;
      const fileName = `${data.meeting.name} Program.pdf`;

      await env.BOOKS.put(r2Key, bytes, {
        httpMetadata: { contentType: PDF_MIME_TYPE },
      });
      await da.documents.recordReady(actor, generatingId, {
        r2Key,
        fileName,
      });
      return { ok: "The program PDF is ready." };
    } catch (error) {
      await da.documents.recordFailed(actor, generatingId);
      console.error("[program] generation failed", error);
      const detail = error instanceof Error ? error.message : "";
      return {
        error: `The program could not be generated.${detail ? ` ${detail}` : ""}`,
      };
    }
  }

  try {
    if (intent === "session-create") {
      await da.programSessions.create(actor, {
        editionId,
        title: String(form.get("title") ?? ""),
        sessionDate: parseWhen(form.get("sessionDate")),
        startsAt: parseWhen(form.get("startsAt")),
        endsAt: parseWhen(form.get("endsAt")),
        location: String(form.get("location") ?? ""),
        moderator: String(form.get("moderator") ?? ""),
      });
      return { ok: "Session added." };
    }

    if (intent === "session-add-concurrent") {
      await da.programSessions.addConcurrentSession(actor, {
        sessionId: String(form.get("sessionId") ?? ""),
        title: String(form.get("title") ?? ""),
        location: String(form.get("location") ?? ""),
      });
      return { ok: "Concurrent session added." };
    }

    if (intent === "session-update") {
      await da.programSessions.update(actor, String(form.get("sessionId") ?? ""), {
        title: String(form.get("title") ?? ""),
        sessionDate: parseWhen(form.get("sessionDate")),
        startsAt: parseWhen(form.get("startsAt")),
        endsAt: parseWhen(form.get("endsAt")),
        location: String(form.get("location") ?? ""),
        moderator: String(form.get("moderator") ?? ""),
      });
      return { ok: "Session saved." };
    }

    if (intent === "session-delete") {
      await da.programSessions.remove(actor, String(form.get("sessionId") ?? ""));
      return { ok: "Session removed." };
    }

    if (intent === "session-move") {
      // Reorder within the day: swap this session with its day neighbor in the
      // display order, then persist through the edition-wide sort order.
      const sessionId = String(form.get("sessionId") ?? "");
      const direction = String(form.get("direction") ?? "");
      const schedule = await da.programSessions.getScheduleForEdition(actor, editionId);
      const day = schedule.days.find((d) =>
        d.groups.some((g) => g.sessions.some((s) => s.id === sessionId)),
      );
      const dayOrder = day ? day.groups.flatMap((g) => g.sessions).map((s) => s.id) : [];
      const idx = dayOrder.indexOf(sessionId);
      const swap = direction === "up" ? idx - 1 : idx + 1;
      if (idx !== -1 && swap >= 0 && swap < dayOrder.length) {
        const neighborId = dayOrder[swap];
        const all = await da.programSessions.listForEdition(actor, editionId);
        const ids = all.map((s) => s.id);
        const i = ids.indexOf(sessionId);
        const j = ids.indexOf(neighborId);
        if (i !== -1 && j !== -1) {
          [ids[i], ids[j]] = [ids[j], ids[i]];
          await da.programSessions.reorder(actor, editionId, ids);
        }
      }
      return { ok: true };
    }

    if (intent === "item-add-abstract") {
      const abstractId = String(form.get("abstractId") ?? "");
      if (!abstractId) return { error: "Choose an abstract to add." };
      await da.programItems.addAbstract(actor, {
        sessionId: String(form.get("sessionId") ?? ""),
        abstractId,
        kind: parseKind(form.get("kind")),
      });
      return { ok: "Abstract added to the session." };
    }

    if (intent === "item-add-speaker") {
      const speakerId = String(form.get("speakerId") ?? "");
      if (!speakerId) return { error: "Choose a speaker to add." };
      await da.programItems.addSpeakerItem(actor, {
        sessionId: String(form.get("sessionId") ?? ""),
        speakerId,
        kind: parseKind(form.get("kind")),
      });
      return { ok: "Speaker added to the session." };
    }

    if (intent === "item-add-custom") {
      await da.programItems.addCustom(actor, {
        sessionId: String(form.get("sessionId") ?? ""),
        customTitle: String(form.get("customTitle") ?? ""),
        kind: parseKind(form.get("kind")),
        note: String(form.get("note") ?? ""),
        startsAt: parseWhen(form.get("startsAt")),
      });
      return { ok: "Item added to the session." };
    }

    if (intent === "item-update") {
      await da.programItems.update(actor, String(form.get("itemId") ?? ""), {
        kind: parseKind(form.get("kind")),
        customTitle: String(form.get("customTitle") ?? ""),
        note: String(form.get("note") ?? ""),
        startsAt: parseWhen(form.get("startsAt")),
      });
      return { ok: "Item saved." };
    }

    if (intent === "item-delete") {
      await da.programItems.remove(actor, String(form.get("itemId") ?? ""));
      return { ok: "Item removed." };
    }

    if (intent === "item-move") {
      const sessionId = String(form.get("sessionId") ?? "");
      const itemId = String(form.get("itemId") ?? "");
      const direction = String(form.get("direction") ?? "");
      const sessions = await da.programSessions.listForEdition(actor, editionId);
      const session = sessions.find((s) => s.id === sessionId);
      if (session) {
        const ids = session.items.map((i) => i.id);
        const idx = ids.indexOf(itemId);
        const swap = direction === "up" ? idx - 1 : idx + 1;
        if (idx !== -1 && swap >= 0 && swap < ids.length) {
          [ids[idx], ids[swap]] = [ids[swap], ids[idx]];
          await da.programItems.reorder(actor, sessionId, ids);
        }
      }
      return { ok: true };
    }
  } catch (error) {
    if (
      error instanceof ValidationError ||
      error instanceof AlreadyExistsError ||
      error instanceof NotFoundError
    ) {
      return { error: error.message };
    }
    throw error;
  }

  return { error: "Unknown action." };
}

export default function ProgramBuilder({ loaderData }: Route.ComponentProps) {
  const { edition, schedule, unplaced, speakers, document } = loaderData;
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const busy = navigation.state === "submitting";
  const [searchParams, setSearchParams] = useSearchParams();

  const statusRef = useRef<HTMLParagraphElement>(null);
  const error = actionData && "error" in actionData ? actionData.error : null;
  const ok = actionData && "ok" in actionData ? actionData.ok : null;
  useEffect(() => {
    if (actionData) statusRef.current?.focus();
  }, [actionData]);

  const dayParam = searchParams.get("day");
  const dayKeys = buildDayKeys(
    schedule.days,
    schedule.meetingStartsAt,
    schedule.meetingEndsAt,
    dayParam,
  );
  const selectedDay = dayParam && dayKeys.includes(dayParam) ? dayParam : (dayKeys[0] ?? null);
  const day = schedule.days.find((d) => d.key === selectedDay) ?? null;
  const flatOrder = day ? day.groups.flatMap((g) => g.sessions).map((s) => s.id) : [];
  const flatIndexOf = (id: string) => flatOrder.indexOf(id);

  function selectDay(key: string) {
    const next = new URLSearchParams(searchParams);
    next.set("day", key);
    setSearchParams(next, { replace: true });
  }

  return (
    <div className="stack-6">
      <div className="stack-2">
        <h1 className="page-title">Schedule</h1>
        <p>
          {edition.name}.{" "}
          <Link to={`/admin/editions/${edition.id}`} className="strong">
            Edit meeting
          </Link>
        </p>
        <p className="cap-muted">
          Build the meeting day by day. Sessions that overlap in time on the same day become
          parallel tracks automatically, one column per session.
        </p>
      </div>

      <p
        ref={statusRef}
        tabIndex={-1}
        role={error ? "alert" : "status"}
        className={error || ok ? "cap-alert" : "cap-sr-only"}
        data-tone={error ? "crit" : "ok"}
      >
        {typeof error === "string" ? error : typeof ok === "string" ? ok : ""}
      </p>

      <div className="cluster">
        <nav aria-label="Meeting days" className="cluster">
          {dayKeys.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => selectDay(key)}
              aria-current={key === selectedDay ? "page" : undefined}
              className="cap-btn"
              data-variant={key === selectedDay ? "primary" : undefined}
            >
              {dayTabLabel(key)}
            </button>
          ))}
        </nav>
        <label className="cluster small cap-muted">
          <span>Add day</span>
          <input
            type="date"
            aria-label="Add a day"
            value=""
            onChange={(e) => {
              if (e.target.value) selectDay(e.target.value);
            }}
            className="cap-input date-field"
            data-size="sm"
          />
        </label>
      </div>

      {selectedDay === null ? (
        <p>
          No days yet. Set the meeting dates on the meeting page, or add a session with a date
          below.
        </p>
      ) : (
        <div className="stack-8">
          <h2 className="subsection-title">{dayTabLabel(selectedDay)}</h2>
          {day && day.groups.length > 0 ? (
            <div className="stack-8">
              {day.groups.map((group, gi) => (
                <Slot
                  key={group.sessions[0]?.id ?? gi}
                  group={group}
                  flatIndexOf={flatIndexOf}
                  dayCount={flatOrder.length}
                  busy={busy}
                  unplaced={unplaced}
                  speakers={speakers}
                />
              ))}
            </div>
          ) : (
            <p>Nothing scheduled on this day yet.</p>
          )}

          <section className="card stack-4">
            <h3 className="strong">Add a session to this day</h3>
            <Form method="post" className="stack-3" noValidate>
              <input type="hidden" name="intent" value="session-create" />
              {/* Keyed by day so the date prefill remounts when the tab changes;
                  an unkeyed defaultValue would keep the previous day's date. */}
              <SessionFields
                key={selectedDay}
                defaultDate={selectedDay === NO_DATE_KEY ? "" : (selectedDay ?? "")}
              />
              <button type="submit" disabled={busy} className="cap-btn" data-variant="primary">
                Add session
              </button>
            </Form>
          </section>
        </div>
      )}

      <ProgramDocumentPanel document={document} editionId={edition.id} busy={busy} />
    </div>
  );
}
