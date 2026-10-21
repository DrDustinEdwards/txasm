import type {
  DataAccess,
  ProgramDay,
  ProgramItemKind,
  ProgramSessionResolved,
} from "~/lib/data-access";
import { PROGRAM_ITEM_KINDS, programKindLabel } from "~/lib/vocab";

// Named config, not a bare literal: one day in milliseconds, for enumerating the
// meeting date range into day tabs.
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const NO_DATE_KEY = "no-date";

export const inputClass =
  "w-full rounded border border-gray-300 px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-gray-700 dark:bg-gray-900";

export const smallButton =
  "rounded border border-gray-300 px-2 py-1 text-sm disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-gray-700";

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

export function toDateInput(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

export function dayTabLabel(key: string): string {
  if (key === NO_DATE_KEY) return "No date";
  const date = new Date(`${key}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? key : DAY_FMT.format(date);
}

function timeLabel(date: Date | null): string {
  return date ? `${TIME_FMT.format(date)} UTC` : "";
}

export function slotTimeLine(session: ProgramSessionResolved): string {
  const start = timeLabel(session.startsAt);
  const end = timeLabel(session.endsAt);
  if (start && end) return `${start} to ${end}`;
  return start || end || "No time set";
}

// The union of days that carry sessions and days inside the meeting range, so a
// meeting day with nothing scheduled still gets a tab. Chronological, with the
// undated bucket (if any) last.
export function buildDayKeys(
  days: ProgramDay[],
  meetingStartsAt: Date | null,
  meetingEndsAt: Date | null,
  extra: string | null,
): string[] {
  const keys = new Set<string>();
  let hasNoDate = false;
  for (const day of days) {
    if (day.key === NO_DATE_KEY) hasNoDate = true;
    else keys.add(day.key);
  }
  if (meetingStartsAt) {
    const start = Date.UTC(
      meetingStartsAt.getUTCFullYear(),
      meetingStartsAt.getUTCMonth(),
      meetingStartsAt.getUTCDate(),
    );
    const endDate = meetingEndsAt ?? meetingStartsAt;
    const end = Date.UTC(
      endDate.getUTCFullYear(),
      endDate.getUTCMonth(),
      endDate.getUTCDate(),
    );
    for (let t = start; t <= end; t += MS_PER_DAY) {
      keys.add(new Date(t).toISOString().slice(0, 10));
    }
  }
  if (extra && extra !== NO_DATE_KEY) keys.add(extra);
  const sorted = [...keys].sort();
  if (hasNoDate) sorted.push(NO_DATE_KEY);
  return sorted;
}

export type SpeakerOption = Pick<
  Awaited<ReturnType<DataAccess["invitedSpeakers"]["listForEdition"]>>[number],
  "id" | "name" | "role" | "talkTitle"
>;

export function KindSelect({
  id,
  defaultValue,
  label = "Kind",
}: {
  id: string;
  defaultValue: ProgramItemKind;
  label?: string;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <select id={id} name="kind" defaultValue={defaultValue} className={inputClass}>
        {PROGRAM_ITEM_KINDS.map((kind) => (
          <option key={kind} value={kind}>
            {programKindLabel(kind)}
          </option>
        ))}
      </select>
    </div>
  );
}
