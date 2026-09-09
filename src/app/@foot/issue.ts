import { site } from '@/lib/site';

/**
 * `08 Sep 2026` — the date half of the document issue.
 *
 * D-07 keeps `Issue 01 · 08 Sep 2026` as ONE constant in `src/lib/site.ts`,
 * because it is the issue of the document and not today's date. Three feet
 * want only its date half — `COMPILED 08 SEP 2026 · TWENTY-SEVEN
 * INGREDIENTS`, `FROZEN 08 SEP 2026 · ELEVEN NOTES` — so it is split here
 * once rather than typed out beside the constant it would then drift from.
 *
 * Not a route: the App Router only treats `page`, `layout`, `default`,
 * `route`, `template`, `error` and `loading` as file conventions, so a
 * module named anything else inside a slot is an ordinary import.
 */
export const ISSUE_DATE = site.issue.split('·').pop()?.trim() ?? site.issue;
