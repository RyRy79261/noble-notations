/**
 * C-12 — the database notice, rebuilt onto the two drawn components.
 *
 * The design labelled these two states for us. Plate III draws each one with
 * its R-number in the right rail:
 *
 *   `plates-3-4.html:1007`  R-STA-01  a neutral F/Notice
 *   `plates-3-4.html:1047`  R-STA-02  an F/Warning with `!` in the gutter
 *
 * `notice.tsx`'s own header already stated the mapping — "C-12's two states
 * map onto the two components exactly: 'not configured' is a neutral
 * F/Notice, 'read failed' is an F/Warning" — and this file closes the loop
 * M3 opened. Neither state gets a component of its own.
 *
 * THE COPY IS THE DESIGN'S. The old notice carried four sentences and three
 * code spans about `pnpm db:migrate` and `pnpm ingest`. The design writes
 * two sentences and names the archive in both, and BUILD-PLAN §2 makes the
 * design the source of truth for how a screen reads. D-07 set the precedent
 * for replacing pre-M3 copy with drawn copy. The migrate-and-ingest
 * instruction was never for a reader: an operator reads AGENTS.md, and a
 * reader who lands on this notice wants to know where the recipes went.
 *
 * Nothing in `e2e/` asserts the old wording — checked before changing it.
 *
 * R-STA-01 and R-STA-02 both require a link to the archive. The design's
 * copy names the archive but draws no link affordance, because the design
 * draws no in-body link anywhere; `PROSE_LINK` in `f/button.tsx` is the
 * treatment that gap forced, it is recorded as D-10, and the reasoning lives
 * beside it. It is imported from there and NOT from `markdown.tsx`: this
 * notice can be drawn by every database-backed route, and reaching into
 * `markdown.tsx` for a class string pulled `react-markdown` and `remark-gfm`
 * into eighteen server module graphs that render no markdown at all.
 *
 * The title is passed in sentence case. `Notice` and `Warning` uppercase it
 * themselves, because the case belongs to the component and not to the copy.
 *
 * Server components.
 */

import Link from 'next/link';

import { PROSE_LINK } from './f/button';
import { Warning } from './f/note';
import { Notice } from './f/notice';

function ArchiveLink() {
  return (
    <Link className={PROSE_LINK} href="/archive">
      archive
    </Link>
  );
}

/**
 * Shown instead of content when the database is not configured, or when a
 * read failed. Says what to do next rather than only reporting an error.
 */
export function DatabaseNotice({ failed }: { failed?: boolean }) {
  if (failed) {
    return (
      <Warning title="Could not read the repository">
        This is temporary. Reload in a moment. If it keeps happening the{' '}
        <ArchiveLink /> still works and is served from the repository.
      </Warning>
    );
  }

  return (
    <Notice tone="neutral" title="The repository is not available">
      {/* `[font-size:inherit]` undoes `globals.css`'s `code { font-size:
          .9em }` without inventing a size. The design sets this name in the
          running Geist with no treatment at all; the mono face is the least
          that still says it is a variable and not a word. */}
      <code className="[font-size:inherit] font-mono text-ink">
        DATABASE_URL
      </code>{' '}
      is not set, so nothing can be read. The <ArchiveLink /> is served straight
      from the repository and still works.
    </Notice>
  );
}
