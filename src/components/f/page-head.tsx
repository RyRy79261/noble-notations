import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { Mark } from './mark';

/* The shell's one breakpoint is `shell:` — `--breakpoint-shell` in
   `theme.css`, at 1080px. `nav-drawer.tsx` says why it must be written out
   as a whole class name at every use. */

export interface PageHeadProps {
  /** The document number and its path: `NN-04-02 · BAUMY BILTONG`. */
  left: ReactNode;
  /** A count, a revision, a date or a status: `SIXTH REVISION · 08 SEP 2026`. */
  right: ReactNode;
  /** The 360 wording of `left`, where the design shortens it. */
  leftNarrow?: ReactNode;
  /** The 360 wording of `right`, where the design shortens it. */
  rightNarrow?: ReactNode;
  /**
   * The right slot's ink. `quiet` is `f-ink-3` and is what 25 of the 26
   * screens draw. `warn` is `f-warn`, and the design uses it on exactly one
   * band: the superseded revision, `recipe-revision-1280.html:195`, where
   * the left slot stays `f-ink-3` — so the contrast is the signal, not the
   * colour on its own. It is the only colour this band ever carries.
   */
  rightTone?: 'quiet' | 'warn';
}

/**
 * `F/Page head` and `F/Page head 360` — band 2 of the two bands at the top
 * of every screen.
 *
 * It is NOT part of the site header. It is a per-screen document kicker
 * with exactly two slots, and both strings change on every one of the 26
 * screens the design draws: the left is a document number and a path, the
 * right is a count, a revision, a date or a status. The layout therefore
 * does not render it. Each screen renders it as the first thing inside
 * `<main>`, immediately under the header, and M4 to M6 wire it as they
 * rebuild each screen.
 *
 *   1280   14/60 padding, no fill and no rule at all, 10px mono at 1.5
 *          tracking in `f-ink-3`.
 *   360    10/16 padding, a `f-desk` ground, 9px mono at 1.3 tracking.
 *
 * A CONTRAST NOTE FOR THE DESIGNER. `f-ink-3` on `f-desk` is 4.70:1, one of
 * the two pairs in the whole palette with almost no margin (TOKEN-MAP §6.4,
 * 0.20 over the threshold). This component is where the design puts them
 * together, at 9px, on every 360 screen. It passes AA and it is hard to
 * read. `pnpm audit:ui` must cover this exact pair at M7.
 *
 * TWO BUILD ADDITIONS.
 *
 * The design sets both slots `white-space: nowrap`, which at 360 puts two
 * unbreakable strings in a 328px box. `truncate` on the left slot is
 * invisible while they fit and ellipsises rather than pushing the document
 * sideways when they do not — R-ACC-11 counts a sideways page as a major
 * fault.
 *
 * The drawn gap is `gap-0` and this is `gap-4`. Four pixels of column gap is
 * a minimum, not a layout: `justify-between` puts the two slots at the
 * edges, so the gap is only ever seen at the width where the left slot
 * reaches the right one — which is exactly where the drawing would have two
 * strings touching. The left slot truncates before that, so nothing the
 * design draws moves. Same reasoning as `page-foot.tsx`.
 */
export function PageHead({
  left,
  right,
  leftNarrow,
  rightNarrow,
  rightTone = 'quiet',
}: PageHeadProps) {
  /*
   * `uppercase` is the band's, not the caller's. All 52 slots across the 26
   * screens are drawn in capitals without exception, and `F/Page foot`
   * already sets it on its own three slots — so a screen that passed plain
   * text got a lower-case kicker beside an upper-case foot, and every M6
   * screen would otherwise have wrapped both strings in a `<span
   * className="uppercase">` to say what the component already knows. It is
   * CSS, so the DOM keeps a string a screen reader can pronounce and a
   * reader can copy.
   *
   * `tabular-nums` is the band's for the same reason (R-CON-06): the right
   * slot is a count, a revision or a date on all but a handful of screens,
   * and two of them were setting it on a wrapper `<span>` of their own.
   *
   * A CALLER MUST NOT WRAP ITS TEXT IN ITS OWN `<span>`. The left slot is
   * `min-w-0 truncate`, which clips the SLOT's box; an inner span keeps its
   * own unclipped box under the right slot, and `pnpm audit:ui` measures
   * that box as a text overlap (R-ACC-11). Every wrapper the M6 screens
   * carried is gone for that reason — pass the string.
   */
  const slot = cn(
    'text-09 leading-normal font-mono tabular-nums tracking-head-360 whitespace-nowrap text-ink-3 uppercase',
    'shell:text-10 shell:tracking-spine',
  );

  return (
    <div
      className={cn(
        'flex w-full shrink-0 flex-row items-center justify-between gap-4 bg-desk px-4 py-2.5',
        'shell:bg-transparent shell:px-15 shell:py-3.5',
      )}
    >
      <Slot
        className={cn(slot, 'min-w-0 truncate')}
        wide={left}
        narrow={leftNarrow}
      />
      <Slot
        className={cn(
          slot,
          'shrink-0',
          rightTone === 'warn' ? 'text-warn' : undefined,
        )}
        wide={right}
        narrow={rightNarrow}
      />
    </div>
  );
}

/**
 * One of the two strings, in its two wordings.
 *
 * Where the two are the same — which is most screens — one element carries
 * both, so a screen reader is not read the same kicker twice.
 */
function Slot({
  className,
  wide,
  narrow,
}: {
  className: string;
  wide: ReactNode;
  narrow?: ReactNode;
}) {
  if (narrow === undefined || narrow === wide) {
    return <div className={className}>{wide}</div>;
  }
  return (
    <>
      <div className={cn(className, 'shell:hidden')}>{narrow}</div>
      <div className={cn(className, 'hidden', 'shell:block')}>{wide}</div>
    </>
  );
}

export interface PageHeroProps {
  /** The accent mono line above the title: `SCIENCE · EIGHT`. */
  kicker?: ReactNode;
  /** The screen's title. Rendered as the page's `<h1>`. */
  title: ReactNode;
  /** The paragraph under it. */
  lede?: ReactNode;
  /**
   * `index` is the 48px hero drawn on twenty screens. `display` is the home
   * masthead and nothing else: the design gives `/` a 72/72 title, a 10px
   * kicker, a 17/31 lede and 20px of column gap
   * (`home-recipes-1280.html:207`), where every other screen takes 48/50,
   * 9px, 16/27 and 12px. The two are identical at 360 — 40/42, 9px, 15/26,
   * 12px — so `display` only ever changes what happens at `shell:`. Added
   * by M6 rather than forked, so the twenty screens on `index` are drawn by
   * the same file and cannot drift from it.
   */
  size?: PageHeroSize;
  /**
   * The lede's measure, as a `shell:max-w-*` utility.
   *
   * THE OPEN HOLE THIS PATCHES, and it is still open. The design overrides
   * the lede width per screen — 640, 740, 760, 780, 820, 840 and 860 — with
   * no scale behind any of them, and TOKEN-MAP §3.2 dropped `--measure` on
   * the grounds that the 1280 frame fixes the width. It does not: a lede
   * left at the 1160px column width wraps two lines where the drawing wraps
   * three, which is a different shape and not a different number. Until the
   * designer rules on one measure or a rule for choosing between seven,
   * each screen states the width it is drawn at, in units of `--spacing`
   * (`shell:max-w-195` is the home lede's 780px). Empty is the column, which
   * is what every screen built before M6 draws.
   */
  ledeClassName?: string;
  /**
   * The kicker's 360 drawing. `run` is the bare accent mono run the hero
   * wraps everything in, and it is what every index screen draws. `mark`
   * is the F/Mark chip the design puts in its place below the shell
   * breakpoint on the access and science screens
   * (`m360-access-science.html:1632`) — the chip overrides the ground and
   * the colour and the plain run draws at `shell:` only.
   *
   * It is a prop and not five copies of a local `Kicker` helper, which is
   * what it was: `/connect`, `/science`, `/science/[slug]`, `/sign-in` and
   * the 404 each carried a byte-identical five-line component. One of the
   * two elements is always `display: none`, so a screen reader is never
   * read the kicker twice — the same construct `PageHead`'s `Slot` uses for
   * its two wordings.
   *
   * A screen whose two drawings differ in WORDING as well as treatment —
   * `/cuisines/[slug]` draws two chips at 360 and one run at 1280 — still
   * passes its own node.
   */
  kickerForm?: 'run' | 'mark';
  /** Anything the screen adds below the lede. */
  children?: ReactNode;
}

export type PageHeroSize = 'index' | 'display';

/**
 * `F/Page hero` — the title band of an index screen.
 *
 * A 12px column of an accent 9px mono kicker, a 48px Newsreader 500 title
 * at 1.05 leading and −1px tracking, and a 16px Geist lede at 1.7 in
 * `f-ink-2`. There is no rule above it or below it: the design separates
 * the head, the hero and the body with padding and a change of type, and
 * the only two rules in the whole shell are the one under the site header
 * and the one over the page foot.
 *
 * At 360 the title drops to 40px and the lede to 15px.
 *
 * TWO HERO SHAPES EXIST IN THE DESIGN and only this one is in §9.5. The
 * index screens use `Page hero`; the recipe and home screens use a richer
 * node named `Hero` — marks row, subtitle, summary, tags, 20px gap — and
 * that one belongs to M5.
 *
 * THE LEDE HAS NO MEASURE, and this is a real hole. The component is drawn
 * with a fixed 660px lede and then overridden per screen to 640, 740, 760,
 * 780, 820, 840 and 860 — eight widths with no scale behind any of them.
 * TOKEN-MAP §3.2 dropped `--measure` on the grounds that the 1280 frame
 * fixes the width; it does not. Rather than invent a ninth value the lede
 * is left at the column width here, and the designer owes M4 either one
 * measure token or a rule for choosing between eight.
 */
export function PageHero({
  kicker,
  title,
  lede,
  size = 'index',
  ledeClassName,
  kickerForm = 'run',
  children,
}: PageHeroProps) {
  const display = size === 'display';

  return (
    <div
      className={cn(
        'flex w-full shrink-0 flex-col items-start gap-3',
        display ? 'shell:gap-5' : undefined,
      )}
    >
      {kicker !== undefined && (
        <div
          className={cn(
            'text-09 leading-normal font-mono tracking-spine uppercase text-accent',
            display ? 'shell:text-10 shell:leading-normal' : undefined,
          )}
        >
          {kickerForm === 'mark' ? (
            <>
              <Mark className="shell:hidden">{kicker}</Mark>
              <span className="hidden shell:inline">{kicker}</span>
            </>
          ) : (
            kicker
          )}
        </div>
      )}
      {/* Every size travels with its leading in ONE argument, or
          tailwind-merge drops the leading with the next size it meets —
          TOKEN-MAP §4.3. */}
      <h1
        className={cn(
          'm-0 text-40 leading-105 font-serif font-medium tracking-display text-ink',
          display
            ? 'shell:text-72 shell:leading-100'
            : 'shell:text-48 shell:leading-105',
        )}
      >
        {title}
      </h1>
      {lede !== undefined && (
        <p
          className={cn(
            'm-0 w-full text-15 leading-170 font-sans tracking-flat text-ink-2',
            display
              ? 'shell:text-17 shell:leading-180'
              : 'shell:text-16 shell:leading-170',
            ledeClassName,
          )}
        >
          {lede}
        </p>
      )}
      {children}
    </div>
  );
}
