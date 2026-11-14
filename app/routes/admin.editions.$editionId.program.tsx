import { Title, Text } from "capsomer/react/text";
import { Stack } from "capsomer/react/stack";
import { Form, useActionData, useNavigation, useSearchParams } from "react-router";
import { fromDateTimeLocal } from "capsomer/behavior/field";
import { Panel } from "capsomer/react/panel";
import { FormStatus, useActionStatus } from "capsomer/react/form-status";
import { Link } from "capsomer/react/link";
import type { Route } from "./+types/admin.editions.$editionId.program";
import { pageTitle } from "~/lib/site-meta";
import { privateMeta } from "@drdustinedwards/site-helpers/head";
import { cloudflareContext } from "@dustinedwards/site-runtime/context";
import { requireChair } from "~/lib/auth.server";
import {
  AlreadyExistsError,
  getDataAccess,
  NotFoundError,
  type ProgramItemKind,
  ValidationError,
} from "~/lib/data-access";
import { renderProgramBook } from "~/lib/program-book";
import puppeteer from "@cloudflare/puppeteer";
import { pagedPdf } from "@dustinedwards/site-runtime/print-pdf";
import {
  ConcurrentSessionForm,
  SessionCard,
  SessionFields,
} from "~/components/program-builder/sessions";
import { PDF_MIME_TYPE } from "~/lib/vocab";
import { dayKeys, dayLabel, dayRange, NO_DATE, pickDay } from "capsomer/behavior/schedule";
import { Schedule, ScheduleDayNav } from "capsomer/react/schedule";
import { GeneratedFile } from "capsomer/react/generated-file";
import { Status } from "capsomer/react/status";
import { readForm } from "@dustinedwards/site-runtime/body";
import { FORM_LIMIT } from "~/lib/form.server";
import schedule from "capsomer/schedule.css?url";
import generatedFile from "~/styles/generated-file.css?url";

// Capsomer stylesheets only this page uses, so no other page downloads them (devkit-route-weight counts them).
export const links: Route.LinksFunction = () => [
  { rel: "stylesheet", href: schedule },
  { rel: "stylesheet", href: generatedFile },
];

export function meta({ matches }: Route.MetaArgs) {
  return privateMeta(pageTitle(matches, "Program"));
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

function parseDay(value: FormDataEntryValue | null): Date | null {
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
  const form = await readForm(request, FORM_LIMIT);
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
      const bytes = await pagedPdf(puppeteer, env.BROWSER, html, {
        origin: new URL(request.url).origin,
        what: "the program",
      });

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
        sessionDate: parseDay(form.get("sessionDate")),
        startsAt: fromDateTimeLocal(form.get("startsAt")),
        endsAt: fromDateTimeLocal(form.get("endsAt")),
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
        sessionDate: parseDay(form.get("sessionDate")),
        startsAt: fromDateTimeLocal(form.get("startsAt")),
        endsAt: fromDateTimeLocal(form.get("endsAt")),
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
        d.slots.some((slot) => slot.items.some((s) => s.id === sessionId)),
      );
      const dayOrder = day ? day.slots.flatMap((slot) => slot.items).map((s) => s.id) : [];
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
        startsAt: fromDateTimeLocal(form.get("startsAt")),
      });
      return { ok: "Item added to the session." };
    }

    if (intent === "item-update") {
      await da.programItems.update(actor, String(form.get("itemId") ?? ""), {
        kind: parseKind(form.get("kind")),
        customTitle: String(form.get("customTitle") ?? ""),
        note: String(form.get("note") ?? ""),
        startsAt: fromDateTimeLocal(form.get("startsAt")),
      });
      return { ok: "Item saved." };
    }

    if (intent === "item-delete") {
      await da.programItems.remove(actor, String(form.get("itemId") ?? ""));
      return { ok: "Item removed." };
    }

    if (intent === "item-reorder") {
      // The session's items in their new order, from the list's drag, keys or buttons.
      await da.programItems.reorder(
        actor,
        String(form.get("sessionId") ?? ""),
        form.getAll("order").map(String),
      );
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
  const status = useActionStatus(actionData);
  const navigation = useNavigation();
  const busy = navigation.state === "submitting";
  const [searchParams, setSearchParams] = useSearchParams();

  const dayParam = searchParams.get("day");
  const keys = dayKeys(
    schedule.days,
    dayRange(schedule.meetingStartsAt, schedule.meetingEndsAt, "UTC"),
    dayParam,
  );
  const selectedDay = pickDay(keys, dayParam);
  const day = schedule.days.find((d) => d.key === selectedDay) ?? null;
  const flatOrder = day ? day.slots.flatMap((slot) => slot.items).map((s) => s.id) : [];
  const flatIndexOf = (id: string) => flatOrder.indexOf(id);

  function selectDay(key: string) {
    const next = new URLSearchParams(searchParams);
    next.set("day", key);
    setSearchParams(next, { replace: true });
  }

  return (
    <Stack gap={6}>
      <Stack gap={3}>
        <Title as="h1" size={2}>
          Schedule
        </Title>
        <p>
          {edition.name}.{" "}
          <Link to={`/admin/editions/${edition.id}`} className="cap-text" data-weight="strong">
            Edit meeting
          </Link>
        </p>
        <p className="cap-muted">
          Build the meeting day by day. Sessions that overlap in time on the same day become
          parallel tracks automatically: side by side where they fit, one under another where they
          do not.
        </p>
      </Stack>

      <FormStatus status={status} />

      <ScheduleDayNav
        days={keys}
        current={selectedDay}
        hrefFor={(key) => `?day=${key}`}
        label="Meeting days"
        noDate="No date"
        renderLink={({ href, children, ...rest }) => (
          <Link to={href} replace preventScrollReset {...rest}>
            {children}
          </Link>
        )}
      >
        <Text as="label" size="small" tone="muted" className="cap-cluster">
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
        </Text>
      </ScheduleDayNav>

      {selectedDay === null ? (
        <p>
          No days yet. Set the meeting dates on the meeting page, or add a session with a date
          below.
        </p>
      ) : (
        <Stack gap={7}>
          <Title size={5}>{dayLabel(selectedDay, { noDate: "No date" })}</Title>
          <Schedule
            days={[day ?? { key: selectedDay, slots: [] }]}
            level={3}
            dayHeadings={false}
            keyOf={(s) => s.id}
            trackOf={(s) => s.location}
            noDate="No date"
            empty="Nothing scheduled on this day yet."
            renderItem={(session, level) => (
              <SessionCard
                session={session}
                level={level as 4 | 5}
                dayIndex={flatIndexOf(session.id)}
                dayCount={flatOrder.length}
                busy={busy}
                unplaced={unplaced}
                speakers={speakers}
              />
            )}
            slotFooter={(slot) => <ConcurrentSessionForm slot={slot} busy={busy} />}
          />

          <Panel title="Add a session to this day" level={3}>
            <Form method="post" className="cap-stack" data-gap="4" noValidate>
              <input type="hidden" name="intent" value="session-create" />
              {/* Keyed by day so the date prefill remounts when the tab changes;
                an unkeyed defaultValue would keep the previous day's date. */}
              <SessionFields
                key={selectedDay}
                defaultDate={selectedDay === NO_DATE ? "" : (selectedDay ?? "")}
              />
              <button type="submit" disabled={busy} className="cap-btn" data-variant="primary">
                Add session
              </button>
            </Form>
          </Panel>
        </Stack>
      )}

      <GeneratedFile
        title="Program document"
        description="Generate the printable program PDF from this schedule. It runs Browser Rendering and can take up to a minute."
        record={document?.record}
        downloadHref={`/admin/editions/${edition.id}/program-document/download`}
        generateLabel="Generate program PDF"
        regenerateLabel="Regenerate program PDF"
        fields={{ intent: "document-generate" }}
        busy={busy}
        renderForm={({ className, children }) => (
          <Form method="post" className={className}>
            {children}
          </Form>
        )}
      >
        {document?.record.generatedAt ? (
          document.status === "published" ? (
            <Status tone="ok">Published</Status>
          ) : (
            <span className="cap-cluster">
              <span className="cap-muted">Draft.</span>
              <Form method="post">
                <input type="hidden" name="intent" value="document-publish" />
                <input type="hidden" name="documentId" value={document.id} />
                <button type="submit" disabled={busy} className="cap-btn">
                  Publish
                </button>
              </Form>
            </span>
          )
        ) : null}
      </GeneratedFile>
    </Stack>
  );
}
