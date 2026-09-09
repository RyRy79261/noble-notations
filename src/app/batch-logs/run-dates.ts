import { citationDate } from '@/components/f/citation';

/**
 * The two date runs the batch-log screens draw, and nothing else.
 *
 * `F/Citation`'s `citationDate` is the one date formatter in the build —
 * `2024-06-12` becomes `12 JUN 2024`, and anything that is not a plain ISO
 * date is passed through untouched, because a date parsed through `Date` in
 * a browser west of Greenwich is the day before. These two read that one
 * function rather than a second calendar.
 */

/**
 * `2024-06-12` → `JUN 2024`.
 *
 * The design writes the SPAN in months and the ROW in days: the page kicker
 * reads `SIX RUNS · JUN 2024 — SEP 2026` and the row beneath it reads
 * `12 JUN 2024` (`batch-logs-1280.html:197`, `:372`). A span to the day is
 * four more characters in a slot that already truncates, and the day of a
 * range's end tells the reader nothing the month does not.
 */
export function monthYear(value: string): string {
  const full = citationDate(value);
  const parts = full.split(' ');
  return parts.length === 3 ? `${parts[1]} ${parts[2]}` : full;
}

export type RunSpan = {
  /** The ISO date of the earliest run that states one. */
  first: string;
  /** The ISO date of the latest. */
  last: string;
  /** `12 JUN 2024`. The section meta writes the span to the day at 1280. */
  firstLabel: string;
  lastLabel: string;
  /** `2024`. The same meta writes it in years at 360, where the design
   *  shortens `SIX · 12 JUN 2024 — 22 SEP 2026` to `SIX · 2024 — 2026`
   *  (`m360-batch-search-list.html:224`) rather than let it wrap. */
  firstYear: string;
  lastYear: string;
};

/**
 * The first and last dates in a list of runs, or `null` when none states one.
 *
 * `experiments.started_at` is nullable (R-STA-05), so the span is computed
 * from the runs that have one rather than from the ends of the list, and a
 * list where nobody wrote a date down draws no span at all instead of a
 * dash between two blanks.
 */
export function runSpan(
  logs: readonly { startedAt: string | null }[],
): RunSpan | null {
  const dates = logs
    .map((log) => log.startedAt)
    .filter((date): date is string => Boolean(date))
    .sort();

  const first = dates[0];
  const last = dates[dates.length - 1];
  if (!first || !last) return null;

  return {
    first,
    last,
    firstLabel: citationDate(first),
    lastLabel: citationDate(last),
    firstYear: year(first),
    lastYear: year(last),
  };
}

/** The four digits of an ISO date, or the whole string when it is not one. */
function year(value: string): string {
  return /^\d{4}-/.test(value.trim()) ? value.trim().slice(0, 4) : value;
}
