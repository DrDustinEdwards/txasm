// The program document renderer. Pure: it takes the assembled ProgramBookData
// (from program.getProgramData) and returns one self-contained, print-ready HTML
// document. It imports nothing server-only. Abstract titles and speaker bios are
// already sanitized HTML (em/sup/sub only) and are placed verbatim; every plain
// text field (rooms, moderators, names, talk titles) is escaped.
//
// Pagination, page numbers, and the running header are handled by Paged.js in
// the browser, the same way the abstract book does. The stored PDF runs this
// HTML through the shared Browser Rendering renderer (renderBookPdf).

import type {
  ProgramBookData,
  ProgramDay,
  ProgramSessionResolved,
  SpeakerPublic,
  SponsorPublic,
} from "./data-access";
import { coverArt, coverFontFaces, coverStyles } from "./cover";
import { escapeHtml } from "./format";
import { programKindLabel, speakerRoleLabel } from "./vocab";

// Escape a string for use inside a CSS string literal (the running header).
function escapeCssString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\s+/g, " ").trim();
}

function joinParts(parts: Array<string | null>): string {
  return parts
    .map((p) => (p ? p.trim() : ""))
    .filter((p) => p.length > 0)
    .join(", ");
}

const DATE_FMT = new Intl.DateTimeFormat("en-US", {
  dateStyle: "long",
  timeZone: "UTC",
});

const DAY_FMT = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});

const TIME_FMT = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
});

function formatMeetingDates(start: Date | null, end: Date | null): string {
  if (start && end) {
    if (start.getTime() === end.getTime()) return DATE_FMT.format(start);
    return `${DATE_FMT.format(start)} to ${DATE_FMT.format(end)}`;
  }
  if (start) return DATE_FMT.format(start);
  if (end) return DATE_FMT.format(end);
  return "";
}

function dayHeading(day: ProgramDay): string {
  if (day.date) return DAY_FMT.format(day.date);
  return "To be scheduled";
}

function timeLabel(date: Date | null): string {
  return date ? `${TIME_FMT.format(date)} UTC` : "";
}

function slotTimeLine(session: ProgramSessionResolved): string {
  const start = timeLabel(session.startsAt);
  const end = timeLabel(session.endsAt);
  if (start && end) return `${start} to ${end}`;
  return start || end || "";
}

function itemBlock(item: ProgramSessionResolved["items"][number]): string {
  const kind = `<span class="kind">${escapeHtml(programKindLabel(item.kind))}</span>`;
  let body: string;
  if (item.abstractId) {
    const code = item.abstractCode
      ? `<span class="item-number">${escapeHtml(item.abstractCode)}</span> `
      : "";
    // abstractTitle is stored sanitized HTML; place it verbatim.
    const title = `<span class="item-title">${item.abstractTitle ?? ""}</span>`;
    const author = item.presentingAuthorName
      ? `<span class="item-author"> ${escapeHtml(item.presentingAuthorName)}</span>`
      : "";
    body = `${code}${title}${author}`;
  } else if (item.speakerId) {
    const name = `<span class="item-title">${escapeHtml(item.speakerName ?? "Invited speaker")}</span>`;
    const talk = item.speakerTalkTitle
      ? `<span class="item-author"> ${escapeHtml(item.speakerTalkTitle)}</span>`
      : "";
    body = `${name}${talk}`;
  } else {
    body = `<span class="item-title">${escapeHtml(item.customTitle ?? "")}</span>`;
  }
  const time = item.startsAt
    ? `<span class="item-time">${escapeHtml(timeLabel(item.startsAt))}</span>`
    : "";
  const note = item.note
    ? `<p class="item-note">${escapeHtml(item.note)}</p>`
    : "";
  return `<li class="item">${time}${kind}${body}${note}</li>`;
}

function sessionBlock(session: ProgramSessionResolved): string {
  const meta = joinParts([session.location, slotTimeLine(session)]);
  const moderator = session.moderator
    ? `<p class="session-moderator">Moderated by ${escapeHtml(session.moderator)}</p>`
    : "";
  const items =
    session.items.length > 0
      ? `<ul class="items">${session.items.map(itemBlock).join("")}</ul>`
      : `<p class="empty">No items listed.</p>`;
  return `<div class="session">
  <h4 class="session-title">${escapeHtml(session.title)}</h4>
  ${meta ? `<p class="session-meta">${escapeHtml(meta)}</p>` : ""}
  ${moderator}
  ${items}
</div>`;
}

function slotBlock(group: ProgramDay["groups"][number]): string {
  const source = group.sessions[0];
  const trackCount = group.sessions.length;
  const time = slotTimeLine(source);
  const heading =
    time || trackCount > 1
      ? `<p class="slot-heading">${escapeHtml(time)}${
          trackCount > 1
            ? `<span class="slot-tracks"> ${trackCount} parallel tracks</span>`
            : ""
        }</p>`
      : "";
  const sessions = group.sessions.map(sessionBlock).join("");
  // One session renders full width; several render as side-by-side tracks.
  const body =
    trackCount > 1
      ? `<div class="tracks">${sessions}</div>`
      : sessions;
  return `<section class="slot">${heading}${body}</section>`;
}

function daySection(day: ProgramDay): string {
  const slots = day.groups.map(slotBlock).join("");
  return `<section class="day">
  <h3 class="day-heading">${escapeHtml(dayHeading(day))}</h3>
  ${slots}
</section>`;
}

function speakersSection(speakers: SpeakerPublic[]): string {
  if (speakers.length === 0) return "";
  const items = speakers
    .map((speaker) => {
      const line = joinParts([
        speaker.role ? speakerRoleLabel(speaker.role) : "",
        speaker.affiliation,
      ]);
      const talk = speaker.talkTitle
        ? `<p class="speaker-talk">${escapeHtml(speaker.talkTitle)}</p>`
        : "";
      // bio is stored sanitized HTML; place it verbatim.
      const bio = speaker.bio
        ? `<div class="speaker-bio">${speaker.bio}</div>`
        : "";
      return `<li class="speaker">
    <p class="speaker-name">${escapeHtml(speaker.name)}</p>
    ${line ? `<p class="speaker-line">${escapeHtml(line)}</p>` : ""}
    ${talk}
    ${bio}
  </li>`;
    })
    .join("");
  return `<section class="speakers">
  <h2 class="page-title">Invited speakers</h2>
  <ul class="speaker-list">${items}</ul>
</section>`;
}

function sponsorsSection(sponsors: SponsorPublic[]): string {
  if (sponsors.length === 0) return "";
  const items = sponsors
    .map((sponsor) => {
      const tier = sponsor.tier
        ? `<span class="sponsor-tier"> ${escapeHtml(sponsor.tier)}</span>`
        : "";
      return `<li class="sponsor"><span class="sponsor-name">${escapeHtml(sponsor.name)}</span>${tier}</li>`;
    })
    .join("");
  return `<section class="sponsors">
  <h2 class="page-title">Sponsors</h2>
  <ul class="sponsor-list">${items}</ul>
</section>`;
}

function titlePage(data: ProgramBookData): string {
  return coverArt({
    meetingName: data.meeting.name,
    dates: formatMeetingDates(
      data.meeting.meetingStartsAt,
      data.meeting.meetingEndsAt,
    ),
    title: "Program",
  });
}

function printStyles(meetingName: string): string {
  const header = escapeCssString(meetingName);
  return `
    ${coverFontFaces()}
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    html { font-family: Georgia, "Times New Roman", serif; color: #111; }
    body { margin: 0; font-size: 10.5pt; line-height: 1.45; }
    h1, h2, h3, h4 { font-family: "Helvetica Neue", Arial, sans-serif; color: #111; }
    sup { font-size: 0.7em; line-height: 0; }

    ${coverStyles()}

    @page {
      size: A4;
      margin: 20mm 18mm 18mm 18mm;
      @top-center { content: "${header}"; font-family: Arial, sans-serif; font-size: 8.5pt; color: #666; }
      @bottom-center { content: counter(page); font-family: Arial, sans-serif; font-size: 8.5pt; color: #666; }
    }
    @page :first { @top-center { content: none; } }

    .doc-note { padding-top: 12pt; font-size: 11pt; color: #555; }

    .page-title { font-size: 18pt; border-bottom: 1px solid #ccc; padding-bottom: 4pt; margin: 0 0 12pt; }

    .day { margin: 0 0 16pt; }
    .day-heading { font-size: 15pt; border-bottom: 2px solid #222; padding-bottom: 3pt; margin: 0 0 10pt; break-after: avoid; }

    .slot { margin: 0 0 12pt; break-inside: avoid; }
    .slot-heading { font-family: Arial, sans-serif; font-size: 9.5pt; color: #444; margin: 0 0 4pt; }
    .slot-tracks { color: #777; }

    .tracks { display: flex; gap: 8pt; align-items: stretch; }
    .tracks .session { flex: 1 1 0; }

    .session { border: 1px solid #ccc; border-radius: 3px; padding: 6pt 8pt; margin: 0 0 8pt; break-inside: avoid; }
    .session-title { font-size: 11.5pt; margin: 0 0 2pt; break-after: avoid; }
    .session-meta { font-family: Arial, sans-serif; font-size: 8.5pt; color: #555; margin: 0 0 2pt; }
    .session-moderator { font-family: Arial, sans-serif; font-size: 8.5pt; color: #555; margin: 0 0 4pt; font-style: italic; }

    .items { list-style: none; margin: 4pt 0 0; padding: 0; }
    .item { margin: 0 0 4pt; padding: 0 0 4pt; border-bottom: 1px dotted #ddd; }
    .item:last-child { border-bottom: none; }
    .item-time { font-family: Arial, sans-serif; font-size: 8pt; color: #666; margin-right: 5pt; }
    .kind {
      display: inline-block; margin-right: 5pt; padding: 0 4pt;
      font-family: Arial, sans-serif; font-size: 7pt; text-transform: uppercase;
      letter-spacing: 0.04em; color: #444; border: 1px solid #bbb; border-radius: 3px;
      vertical-align: middle;
    }
    .item-number { color: #444; font-weight: bold; }
    .item-author { color: #555; }
    .item-note { margin: 2pt 0 0; font-size: 9pt; color: #555; }
    .empty { font-size: 9pt; color: #777; margin: 2pt 0 0; }

    .speakers { break-before: page; }
    .speaker-list { list-style: none; margin: 0; padding: 0; }
    .speaker { margin: 0 0 10pt; break-inside: avoid; }
    .speaker-name { font-size: 11pt; font-weight: bold; margin: 0; }
    .speaker-line { font-family: Arial, sans-serif; font-size: 9pt; color: #555; margin: 0 0 2pt; }
    .speaker-talk { font-style: italic; margin: 0 0 2pt; }
    .speaker-bio { font-size: 9.5pt; text-align: justify; }

    .sponsors { break-before: page; }
    .sponsor-list { list-style: none; margin: 0; padding: 0; column-count: 2; column-gap: 12mm; }
    .sponsor { break-inside: avoid; margin: 2pt 0; font-size: 10pt; }
    .sponsor-tier { color: #555; font-size: 9pt; }
  `;
}

function emptyState(data: ProgramBookData): string {
  return `${titlePage(data)}
<section class="empty-program"><p class="doc-note">The schedule has no sessions yet. Build the program, then generate this document.</p></section>`;
}

export function renderProgramBook(data: ProgramBookData): string {
  const hasSchedule = data.days.some((day) => day.groups.length > 0);
  const schedule = hasSchedule
    ? data.days.map(daySection).join("")
    : "";
  const body = hasSchedule
    ? `${titlePage(data)}<section class="schedule">${schedule}</section>${speakersSection(
        data.speakers,
      )}${sponsorsSection(data.sponsors)}`
    : emptyState(data);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(data.meeting.name)} Program</title>
<style>${printStyles(data.meeting.name)}</style>
</head>
<body>
${body}
<script>
  // Signal when Paged.js has finished laying out the pages, the same hook the
  // abstract book uses. The PDF render waits on it so page.pdf captures the
  // paginated output. Must run before the polyfill so the auto runner sees it.
  window.PagedConfig = {
    auto: true,
    after: () => {
      document.documentElement.setAttribute("data-pagedjs-done", "true");
    },
  };
</script>
<script src="https://unpkg.com/pagedjs/dist/paged.polyfill.js"></script>
</body>
</html>`;
}
