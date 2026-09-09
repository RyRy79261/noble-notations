/**
 * The recipe screen — §10.2 of the specification, drawn from
 * `design/exports/recipe-1280.html`, `recipe-revision-1280.html`,
 * `recipe-1280-dark.html` and `recipe-360.html`.
 *
 * This file is the ASSEMBLY. Every mark on it is an M3 or M4 primitive or a
 * sibling's client component; the only things declared here are the four
 * shapes the design draws on this screen and nowhere else — the hero, the
 * control bar, the page-level band and the step.
 *
 * ── THE THREE BREAKPOINTS THIS SCREEN READS ────────────────────────────
 *
 *   `shell:` 1080   the PAGE GUTTER only, so the content lines up with the
 *                   site header, which switches to the drawer at the same
 *                   width. 16px below, 60px above (`Main`'s own padding in
 *                   the export).
 *   `recipe:` 901   everything else on the screen: the hero's type, the
 *                   control bar's axis, the aside/tabs split (§10.2.2 fixes
 *                   901), the band spine, the step column.
 *   none            the dark theme. `recipe-1280-dark.html` is an exact
 *                   token swap of `recipe-1280.html` — 723 lines, one
 *                   difference, and that difference is the frame's own
 *                   name — so there is not one `dark:` utility on this
 *                   screen and there must not be.
 *
 * At 768 the header is a drawer AND the recipe is tabs. At 1024 the header
 * is a drawer AND the recipe is an aside, with the 16px gutter: 1024 − 32 −
 * 340 − 60 leaves a 592px main column. Both states are drawn by one DOM.
 *
 * ── WHERE THE ADD-TO-LIST CONTROL LIVES, AND WHY ───────────────────────
 *
 * In the control bar, which is band 4 at 1280 and band 2 at 360 — above the
 * tab strip and outside every panel (R-SCR-03). It used to sit inside the
 * Ingredients panel, so on a phone, where the browser hides the panel that
 * is not active, it measured 0 × 0 the moment a reader pressed Method, and
 * it was about 2.9 screens down. Measured after this rebuild at 360 × 640,
 * the shortest viewport anything drives: its box ends above the fold with
 * no scroll (R-SCR-04). The measurement is in the M5 report.
 *
 * ── WHAT THE DESIGN DRAWS THAT THIS BUILD DOES NOT ─────────────────────
 *
 * Three things, each because the repository holds no data for it, and each
 * recorded in the M5 report rather than invented:
 *
 *   The mass-flow figure (R-SCR-39, a MAY). Seven numbered stages with a
 *     mass, a count or a duration each. The schema holds one finished mass
 *     (`yield_quantity`) and no raw mass and no per-stage mass, so there is
 *     nothing to plot. Summing the ingredient lines is not the same figure
 *     and would need cross-unit conversion, which this build refuses
 *     everywhere else.
 *   The change apparatus — the `SHOWING CHANGES SINCE THE FIFTH REVISION`
 *     toggle, the `S6` markers and the 3px transparent rule that reserves
 *     their gutter on every unchanged step. It is a whole revision-diff
 *     feature with no R-number, no §9.3 component and no query. Without the
 *     markers the 28px inset is dead space, so the steps do not carry it.
 *   `CHAPTER 04 · CURED AND DRIED`, the hero's right-hand kicker. There is
 *     no chapter in the data model.
 *
 * A Server Component (R-CON-01). The five client components it composes are
 * the ones §9.3 already lists; this file adds none, and it passes JSX across
 * the boundary and never a function (R-CON-02).
 */

import Link from 'next/link';
import type { HTMLAttributes, ReactNode } from 'react';

import { BatchLine } from '@/components/f/batch-line';
import { Breadcrumb } from '@/components/f/breadcrumb';
import { FOCUS_RING, PROSE_LINK } from '@/components/f/button';
import { Citation, citationDate } from '@/components/f/citation';
import {
  Mark,
  MarkQuiet,
  noteKindLabel,
  noteSeverity,
} from '@/components/f/mark';
import { Mechanism } from '@/components/f/mechanism';
import { Footnote, Warning } from '@/components/f/note';
import { Empty, Notice } from '@/components/f/notice';
import { PageHead } from '@/components/f/page-head';
import { CardGrid, RecipeCard } from '@/components/f/recipe-card';
import { Revision } from '@/components/f/revision';
import { Section360 } from '@/components/f/section-label';
import { Measure, Stat } from '@/components/f/stat';
import type { NoteView, RecipeView, StepView } from '@/lib/queries/read';
import { revisionOrdinal } from '@/lib/site';
import { cn } from '@/lib/utils';

import { IngredientChecklist } from './ingredient-checklist';
import { Markdown } from './markdown';
import { RecipeTabs } from './recipe-tabs';
import { BatchControl, ScaleProvider, ScaledAmount } from './scale';
import { AddToBasket } from './shopping-basket';
import { StepIngredients } from './step-ingredients';
import { TermList } from './tags';

/** §10.2.3's five link kinds, in the specification's own words. */
const LINK_LABELS: Record<string, string> = {
  derived_from: 'Derived from',
  variant_of: 'Variant of',
  component_of: 'Component of',
  pairs_with: 'Pairs with',
  references: 'References',
};

/**
 * The phase letter beside a step number — `A`, `B`, `C`. The design numbers
 * the steps continuously across the phases (1, 2 | 3, 4, 5 | 6, 7) and lets
 * this letter say which phase a step is in, so a reader can say "step five"
 * without saying which phase it is the second of.
 */
const PHASE_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function groupByPhase(steps: StepView[]) {
  const groups: { phase: string; steps: StepView[] }[] = [];
  for (const step of steps) {
    const phase = step.phase ?? '';
    const last = groups[groups.length - 1];
    if (last && last.phase === phase) last.steps.push(step);
    else groups.push({ phase, steps: [step] });
  }
  return groups;
}

/**
 * R-SCR-06 — a time never scales. Doubling a batch does not double the
 * fourteen days it hangs for.
 */
function formatDuration(
  minutes: number | null,
  max: number | null,
): string | null {
  if (minutes == null) return null;
  const render = (m: number) =>
    m >= 1440
      ? `${Math.round((m / 1440) * 10) / 10} d`
      : m >= 60
        ? `${Math.round((m / 60) * 10) / 10} h`
        : `${m} min`;
  return max != null && max !== minutes
    ? `${render(minutes)}–${render(max)}`
    : render(minutes);
}

/** A date the design's way — `08 SEP 2026` — or nothing at all. */
function stamp(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  return citationDate(value);
}

/* ── The band head ────────────────────────────────────────────────────────
 *
 * `recipe-1280.html` draws NOTES, REVISIONS, PROVENANCE, BATCH LOGS and
 * LITERATURE with one shape, and it is not F/Section label: a 178px accent
 * mono spine on the left, a 764px centre, and a 130px right-aligned quiet
 * meta, with no rule and no ground.
 *
 *     L       text-[ 9px ]/[ 16px ] w-[ 178px ] shrink-0 #8E2A1E 1.5px
 *     Centre  [ flex:1_1_0 ] flex-col gap-[ 16px ]
 *     M       text-[ 9px ]/[ 16px ] w-[ 130px ] shrink-0 #79655F 1.2px right
 *
 * THAT SPINE IS NOT DRAWN HERE, AND THE REASON IS ARITHMETIC.
 *
 * The design draws those five as siblings of the tabbed area, at PAGE level:
 * 1160px wide, 764px of which is the centre. §10.2.3 puts them inside the
 * Method, Science and Revisions panels instead, and the brief follows §10.2.3
 * — so the band is in a 700px column at 1280, 504px at 1024 and 409px at 901.
 * 178 + 44 + 44 + 130 is 396px of that, and the first build of this file drew
 * it: the revision rationale came out 85px wide and wrapped one word to a
 * line. Measured, not guessed.
 *
 * So the head is the one the design DOES draw inside a column — the aside's
 * `AT A GLANCE` and `INGREDIENTS` head, which is F/Section 360: an accent
 * 9px mono micro-label on a hairline with a quiet meta at the right edge,
 * full width, at every width. `Reason for change` and the phase heads are the
 * design's other two in-panel heads and both are full width too; a spine is a
 * page-level device and this is not a page-level band.
 *
 * F/Section 360 is not reused as the component because its body is a fixed
 * 16px column and three of these bands need their own (32px between
 * mechanisms, 20px between citations, 0 between ruled rows), and because the
 * head takes `recipe:pt-2` for the 1280 form the aside also uses.
 */
function Band({
  label,
  meta,
  children,
  className,
  bodyClassName,
  ...props
}: HTMLAttributes<HTMLElement> & {
  label: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn(
        'flex w-full min-w-0 shrink-0 flex-col items-start gap-3 recipe:gap-6',
        className,
      )}
      {...props}
    >
      <div
        className={cn(
          'flex w-full shrink-0 flex-row items-center gap-3 pb-1.75 recipe:gap-4 recipe:pt-2 recipe:pb-2',
          /* One four-value declaration, because the preflight is off until
             M7: `border-b` beside a bare `border-solid` would give the other
             three sides the CSS initial `medium`. Same note as in
             `notice.tsx`, `note.tsx` and `section-label.tsx`. */
          '[border-style:solid] [border-width:0px_0px_1px_0px] border-b-hair',
        )}
      >
        <h2 className="m-0 text-09 leading-normal font-mono font-normal tracking-spine uppercase text-accent">
          {label}
        </h2>
        {meta ? (
          <span className="ml-auto text-09 font-mono tabular-nums tracking-label uppercase text-ink-3">
            {meta}
          </span>
        ) : null}
      </div>

      <div
        className={cn(
          'flex w-full min-w-0 flex-col items-start gap-4',
          bodyClassName,
        )}
      >
        {children}
      </div>
    </section>
  );
}

/* ── One step ──────────────────────────────────────────────────────────── */

/**
 * R-SCR-33 — the chips and the meta row, told apart six ways.
 *
 *                  step chips (F/Ingredient callout)   meta row (F/Measure)
 *   container      a 1px f-hair box per item           nothing
 *   ground         f-accent-wash on the amount half    none
 *   colour         amount f-accent, name f-ink         label f-ink-3, value f-ink-2
 *   size           11px amount / 13px name             8px label / 11px value
 *   face on noun   Geist                               Geist Mono
 *   label          none — the name is the content      a mono capital key
 *
 * One holds ingredients and is boxed, washed and set in the sans. The other
 * holds conditions and is unboxed, quiet and entirely mono under a capital
 * key. The design's own vocabulary for those keys is TIME, TEMP, WORK and
 * TOOL, which is exactly §10.2.4's duration, temperature, technique and
 * equipment.
 */
function Step({
  step,
  number,
  letter,
  lines,
}: {
  step: StepView;
  number: number;
  letter: string | null;
  lines: RecipeView['ingredients'];
}) {
  const duration = formatDuration(
    step.durationMinutes,
    step.durationMaxMinutes,
  );
  const hasMeta =
    duration !== null ||
    step.temperatureC != null ||
    step.technique !== null ||
    step.equipment.length > 0;

  return (
    <li className="flex w-full shrink-0 list-none flex-row items-start gap-4 recipe:gap-5">
      {/* `No` — a 46px column holding a 26/26 Newsreader number over the
          phase letter. The same width as the ingredient row's quantity, so
          the steps and the amounts share one rhythm. */}
      <span className="flex w-8 shrink-0 flex-col items-start gap-1 recipe:w-11.5">
        <span className="text-21 leading-100 font-serif font-medium tabular-nums text-ink recipe:text-26 recipe:leading-100">
          {number}
        </span>{' '}
        {letter ? (
          <span className="text-08 font-mono tracking-label uppercase text-ink-3">
            {letter}
          </span>
        ) : null}
      </span>{' '}
      <div className="flex min-w-0 flex-1 basis-0 flex-col items-start gap-3">
        {/* 16px over 29px — `leading-180`, the same body role the rationale
            takes, and the only primary-ink prose on the screen. */}
        <p className="m-0 w-full text-15 leading-180 font-sans text-ink recipe:text-16 recipe:leading-180">
          {step.instruction}
        </p>

        {/* §10.2.4 item 2. The design draws a POINTER here — `NOTES 1` into
            the numbered apparatus below — because its own step notes live in
            that apparatus. `recipe_steps.note` is prose and has no ordinal
            to point at, so the prose is set in the note body role: 14/24
            Geist in the secondary ink, under a 16px primary instruction. */}
        {step.note ? (
          <p className="m-0 w-full text-14 leading-170 font-sans text-ink-2">
            {step.note}
          </p>
        ) : null}

        {step.imageUrl ? (
          /* `.step-image` is kept as a SELECTOR — `e2e/mcp-lifecycle.spec.ts`
             needs it and `globals.css` lives until M7 — and every property
             the legacy rule sets is answered by a utility beside it, the
             same way `recipe-tabs.tsx` keeps `.recipe-tabs`. The legacy rule
             draws a 12px radius, a 1px border, an `f-desk` fill, a 4/3 crop
             and a 26rem cap; the design is square, unfilled and unbordered
             (TOKEN-MAP §4.5 counts one radius in the whole system, and it is
             a 2px chip corner). */
          <figure className="step-image m-0 flex w-full max-w-full flex-col items-start gap-2">
            {/* Plain <img>, not next/image: these URLs come from arbitrary
                hosts via the MCP, and pointing the image optimiser at
                attacker-supplied origins is a request-forgery surface that
                buys nothing here. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={step.imageUrl}
              alt={step.imageAlt ?? ''}
              loading="lazy"
              decoding="async"
              className="aspect-auto h-auto max-h-none w-full rounded-none border-0 bg-transparent object-fill"
            />
            {step.imageAlt ? (
              <figcaption className="m-0 text-13 leading-150 font-serif italic text-ink-3">
                {step.imageAlt}
              </figcaption>
            ) : null}
          </figure>
        ) : null}

        <StepIngredients uses={step.uses} lines={lines} />

        {hasMeta ? (
          <div className="flex w-full flex-row flex-wrap items-center gap-x-6 gap-y-2 pt-0.5">
            {duration ? <Measure label="Time" value={duration} /> : null}
            {step.temperatureC != null ? (
              <Measure label="Temp" value={`${step.temperatureC} °C`} />
            ) : null}
            {step.technique ? (
              <Measure
                label="Work"
                value={
                  <Link
                    href={`/classes/technique/${step.technique.slug}`}
                    className={cn('text-ink-2 no-underline', FOCUS_RING)}
                  >
                    {step.technique.label}
                  </Link>
                }
              />
            ) : null}
            {step.equipment.map((item) => (
              <Measure key={item} label="Tool" value={item} />
            ))}
          </div>
        ) : null}
      </div>
    </li>
  );
}

/* ── The screen ────────────────────────────────────────────────────────── */

export function RecipeDetail({
  recipe,
  isHistorical,
  currentRevisionNumber = recipe.revisionNumber,
}: {
  recipe: RecipeView;
  isHistorical: boolean;
  /**
   * The revision that is CURRENT, which is not always the one being read and
   * is not `recipe.revisionNumber`.
   *
   * `getRecipeBySlug(slug, n)` sets `RecipeView.revisionNumber` to the
   * revision it was asked for (`src/lib/queries/read.ts:645`), so the
   * expression the revision page used to compute `isHistorical` from —
   * `recipe.revision.revisionNumber !== recipe.revisionNumber` — compared a
   * number with itself and was false on every revision ever served. R-SCR-16
   * and R-STA-06 both went unmet and nothing caught it: the notice rendered
   * on no page, so no test could see it disappear.
   *
   * It is a parameter and not a derivation because the current revision is
   * whichever row `recipes.current_revision_id` points at, and that is not
   * the highest number: `backfill_revision` adds an EARLIER version with a
   * LATER number, which `e2e/backfill.spec.ts` seeds as revision 3 while
   * revision 2 is still current.
   */
  currentRevisionNumber?: number;
}) {
  const rev = recipe.revision;
  const phases = groupByPhase(recipe.steps);

  // Science gets its own panel: it explains what is happening in the dish,
  // which is a different question from the running commentary of
  // observations, results and corrections (R-SCR-11, §10.2.3).
  const science = recipe.notes.filter((note) => note.kind === 'science');
  const otherNotes = recipe.notes.filter((note) => note.kind !== 'science');

  /*
   * The Literature block — §10.2.3 and R-SCR-38.
   *
   * `note_sources` is the only citation this schema holds, so the recipe's
   * literature is every source its notes carry, collected once and numbered
   * `[1]…[n]`. Collected rather than repeated: `NoteList` draws each source
   * under the note that cites it, which is right on `/ingredients/[slug]`
   * and `/batch-logs/[slug]` where there is no apparatus to collect into,
   * and would print the same rows twice on a screen that has one. That is
   * why the notes below are composed from F/Footnote and F/Warning directly
   * rather than through `NoteList` — and it is the design's own model:
   * Plate II's caption for this apparatus is "numbered, referenced from the
   * step, collected at the foot".
   *
   * Deduplicated on the whole row, because two notes citing one paper is a
   * bibliography of one entry.
   */
  const citations = [
    ...new Map(
      recipe.notes
        .flatMap((note) => note.sources)
        .map((source) => [
          `${source.url ?? ''}|${source.title ?? ''}|${source.citation ?? ''}|${source.accessedAt ?? ''}`,
          source,
        ]),
    ).values(),
  ];

  const related = [
    ...recipe.links.map((link) => ({
      key: `out-${link.recipe.slug}-${link.kind}`,
      label: LINK_LABELS[link.kind] ?? link.kind,
      note: link.note,
      recipe: link.recipe,
    })),
    ...recipe.backlinks.map((link) => ({
      key: `in-${link.recipe.slug}-${link.kind}`,
      label: 'Referenced by',
      note: null,
      recipe: link.recipe,
    })),
  ];

  // A tab with nothing behind it is a dead control (R-SCR-27), and most
  // recipes carry neither a science note nor a recorded run.
  const hasScience = science.length > 0 || recipe.experiments.length > 0;

  // A research write-up has no ingredients and no yield, so its aside is
  // empty — and an empty aside is a third of a desktop screen held open
  // beside the one column that has anything in it (R-SCR-29).
  const hasGlance = Boolean(
    rev.yieldQuantity ||
    rev.servings ||
    rev.totalTimeMinutes ||
    rev.activeTimeMinutes,
  );
  const hasAside = recipe.ingredients.length > 0 || hasGlance;

  const hasMethod =
    Boolean(rev.rationale) ||
    recipe.steps.length > 0 ||
    otherNotes.length > 0 ||
    Boolean(recipe.originNote) ||
    related.length > 0 ||
    citations.length > 0;

  const ordinal =
    revisionOrdinal(rev.revisionNumber) ?? `Revision ${rev.revisionNumber}`;
  const revisionDate = stamp(rev.createdAt);

  /* R-CON-06: every number on this screen is mono. `tabular-nums` on the
     head keeps the kicker from shuffling between revisions.

     The narrow wording drops the date on a superseded revision, which is the
     only string long enough to matter: `FIRST REVISION · 09 SEP 2026 ·
     SUPERSEDED` is 41 characters of `whitespace-nowrap` in a 328px box, and
     F/Page head can only truncate the LEFT slot — the right one is
     `shrink-0`. It printed straight over the title and `pnpm audit:ui`
     reported it as two `text-overlap` MAJOR faults. Shortening at 360 is
     what `rightNarrow` exists for and what the design does with every
     string on this band. */
  const headRight = [ordinal, revisionDate, isHistorical ? 'Superseded' : null]
    .filter(Boolean)
    .join(' · ');
  const headRightNarrow = isHistorical ? `${ordinal} · Superseded` : null;

  return (
    // The batch multiplier lives above everything that shows a quantity, so
    // the yield in "At a glance", the ingredient list and the step chips
    // cannot disagree (R-CMP-11).
    <ScaleProvider servings={rev.servings}>
      <PageHead
        left={<span className="uppercase">Recipes · {recipe.title}</span>}
        leftNarrow={<span className="uppercase">{recipe.title}</span>}
        right={<span className="uppercase tabular-nums">{headRight}</span>}
        /* `f-warn` on a superseded revision and `f-ink-3` otherwise. The
           design draws the kicker in the warn red on that screen only
           (`recipe-revision-1280.html:195`), against the `f-ink-3` of the
           slot beside it — the one colour signal this band ever carries. */
        rightTone={isHistorical ? 'warn' : 'quiet'}
        /* `undefined` on a current revision, so F/Page head draws ONE
           element rather than a visible pair with one of them hidden. */
        rightNarrow={
          headRightNarrow ? (
            <span className="uppercase tabular-nums">{headRightNarrow}</span>
          ) : undefined
        }
      />

      <div
        className={cn(
          'flex w-full min-w-0 flex-col items-start gap-7',
          'px-4 pt-5.5 pb-12',
          'recipe:gap-11',
          /* The gutter, and the ONE thing on this screen that reads
             `shell:`. It has to agree with the site header, whose own
             padding switches at 1080 — a 60px content gutter under a 16px
             header rule is a visible seam at every width between them.

             THE KNOWN CONSEQUENCE, RECORDED RATHER THAN PATCHED. Between
             901 and 1079 the layout is the desktop one (`recipe:`) while
             the gutter and every M4 component inside the panels are still
             on `shell:`, so a 587px method column draws the 360 form and a
             500px one at 1080 draws the 1280 form. Moving the gutter to
             `recipe:` removes that inversion and creates a worse one — the
             header would keep its 16px rule under a 60px content gutter at
             1024, a width the build is measured at. The real fix is to key
             `f/note.tsx`, `f/mechanism.tsx`, `f/citation.tsx`,
             `f/revision.tsx` and `f/recipe-card.tsx` to the layout that
             contains them; those five are on every screen, so it belongs to
             M6 or M7 and not to this file. */
          'shell:px-15 shell:pt-8.5 shell:pb-18',
        )}
      >
        {/* The design draws no breadcrumb at 360: the drawer carries the
            whole navigation there, and the trail is the third mono
            micro-label in a 328px column. */}
        <Breadcrumb
          className="hidden recipe:block"
          items={[
            { label: 'Recipes', href: '/recipes' },
            ...(isHistorical
              ? [
                  { label: recipe.title, href: `/recipes/${recipe.slug}` },
                  { label: ordinal },
                ]
              : [{ label: recipe.title }]),
          ]}
        />

        {/* ── The hero, §10.2.1 ─────────────────────────────────────────── */}
        <header className="flex w-full shrink-0 flex-col items-start gap-3 recipe:gap-5">
          {/* Items 1, 2 and 3. `flex-wrap` and not the design's `Gap`
              spacer: the source badge is kept at 360, where the design
              drops it, because which hand wrote a revision is a fact about
              the record and not a luxury of screen width. */}
          <div className="flex w-full shrink-0 flex-row flex-wrap items-center gap-2 recipe:gap-3">
            <Mark kind={recipe.kind} />
            <MarkQuiet tone={isHistorical ? 'warn' : 'neutral'}>
              {ordinal}
            </MarkQuiet>
            {rev.source !== 'human' ? (
              <MarkQuiet tone="faint">Via {rev.source}</MarkQuiet>
            ) : null}
          </div>

          {/* Item 9, and R-SCR-16. The design puts it here — hero child 2,
              ABOVE the title — and not at the foot of the hero where
              §10.2.1 lists it: a reader who has started the title has
              already started reading the wrong revision. The link is a
              phrase inside the sentence, which is the shape D-10 settled
              for a body link, and it is what R-SCR-16's "MUST link" needs. */}
          {isHistorical ? (
            <Notice
              tone="warn"
              title={`You are reading revision ${rev.revisionNumber} of ${recipe.revisions.length}`}
            >
              Revision {currentRevisionNumber} is current. This one is kept
              because a record that discards a revision is not a record.{' '}
              <Link href={`/recipes/${recipe.slug}`} className={PROSE_LINK}>
                Go to the current revision
              </Link>
              .
            </Notice>
          ) : null}

          {/* Item 4. 72/72 at 1280 and 40/42 at 360. The design's
              `white-space: nowrap` is an export artefact and is not
              shipped — a long title has to wrap (R-STA-09). Size and
              leading travel together in one argument, or tailwind-merge
              drops the leading (TOKEN-MAP §4.3). */}
          <h1 className="m-0 w-full text-40 leading-105 font-serif font-medium tracking-display text-ink recipe:text-72 recipe:leading-100">
            {recipe.title}
          </h1>

          {/* Item 5. */}
          {recipe.subtitle ? (
            <p className="m-0 w-full text-16 leading-150 font-serif italic text-ink-2 recipe:text-21 recipe:leading-normal">
              {recipe.subtitle}
            </p>
          ) : null}

          {/* Item 6. `w-180` is the design's fixed 720px measure, and it is
              a maximum here rather than a width: the band is 904px at 1024
              and 328px at 360. */}
          {recipe.summary ? (
            <p className="m-0 w-full max-w-180 text-15 leading-170 font-sans text-ink-2 recipe:text-17 recipe:leading-180">
              {recipe.summary}
            </p>
          ) : null}

          {/* Item 7. The design draws no image on this screen — zero <img>
              and zero <svg> across all four recipe exports — so the caption
              takes the nearest drawn annotation, the ingredient row's serif
              italic `Prep`. */}
          {recipe.heroImageUrl ? (
            <figure className="recipe-hero-image m-0 flex w-full max-w-full flex-col items-start gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={recipe.heroImageUrl}
                alt={recipe.heroImageAlt ?? ''}
                loading="lazy"
                decoding="async"
                className="aspect-auto h-auto max-h-none w-full rounded-none border-0 bg-transparent object-fill"
              />
              {recipe.heroImageAlt ? (
                <figcaption className="m-0 text-13 leading-150 font-serif italic text-ink-3">
                  {recipe.heroImageAlt}
                </figcaption>
              ) : null}
            </figure>
          ) : null}

          {/* Item 8. The design draws 24px between terms at 1280 and, at 360,
              a COLUMN of rows: `flex-col gap-[ 8px ]` holding `flex-row
              gap-[ 20px ]`. One wrapping row gives both — 20px across and 8px
              down at 360, 24px both ways at 1280 — and it is 64px of hero
              height at 360 against a uniform 24px, which is the difference
              between the add-to-list control clearing the fold on a small
              phone and not. F/Tag itself has no ground, no border and no
              padding: the gaps are the whole separation. */}
          <TermList
            terms={recipe.terms}
            showFacet
            className="gap-x-5 gap-y-2 recipe:gap-x-6 recipe:gap-y-4"
          />
        </header>

        {/* ── The control bar, §10.2.5 and R-SCR-03 ─────────────────────
            Band 4 at 1280 and band 2 at 360, and the one place on the page
            with the `f-desk` ground. It switches axis at `recipe:` because
            `BatchControl` does; the two have to agree or the bar is a row
            holding a column. */}
        {hasAside || recipe.ingredients.length > 0 ? (
          <div className="flex w-full shrink-0 flex-col items-stretch gap-3 bg-desk p-3.5 recipe:flex-row recipe:items-center recipe:justify-between recipe:gap-4 recipe:px-4.5 recipe:py-4">
            <BatchControl
              yieldQuantity={rev.yieldQuantity}
              yieldUnit={rev.yieldUnit}
            />

            {/*
             * C-18 is `src/components/shopping-basket.tsx`, which is not in
             * M5's scope, and it draws itself with the two `globals.css`
             * button classes. The design's ADD TO LIST is F/Button primary —
             * square, 11/18, a 10px mono label at 1.5px tracking — so the
             * treatment is applied from the wrapper. `@layer utilities` sits
             * above `@layer legacy`, so a utility here beats `.button-primary`
             * whatever the specificity, and the component itself is untouched
             * (R-CMP-13 and R-CON-04 still hold: it is in the served HTML and
             * corrects its own label after the page loads).
             *
             * The "in list" state takes F/Button's `quiet` variant, which is
             * the only second button shape the design draws.
             */}
            {recipe.ingredients.length > 0 ? (
              <div
                className={cn(
                  'basket-cta mt-0 w-full recipe:w-fit recipe:shrink-0',
                  '[&>button]:m-0 [&>button]:inline-flex [&>button]:w-full [&>button]:items-center [&>button]:justify-center',
                  '[&>button]:cursor-pointer [&>button]:appearance-none [&>button]:rounded-none [&>button]:border-0',
                  '[&>button]:px-4.5 [&>button]:py-2.75',
                  '[&>button]:text-10 [&>button]:leading-normal [&>button]:font-mono [&>button]:font-normal',
                  '[&>button]:tracking-spine [&>button]:uppercase [&>button]:whitespace-nowrap',
                  '[&>button]:bg-accent [&>button]:text-on-accent',
                  'recipe:[&>button]:w-fit',
                  '[&>.button-secondary]:bg-transparent [&>.button-secondary]:text-ink',
                  '[&>.button-secondary]:outline-1 [&>.button-secondary]:-outline-offset-1 [&>.button-secondary]:outline-hair',
                  '[&>button:focus-visible]:outline-2 [&>button:focus-visible]:outline-offset-2 [&>button:focus-visible]:outline-ring',
                )}
              >
                <AddToBasket slug={recipe.slug} title={recipe.title} />
              </div>
            ) : null}
          </div>
        ) : null}

        <RecipeTabs
          /* ── Ingredients: At a glance · Ingredients ─────────────────── */
          ingredients={
            hasAside ? (
              <>
                {hasGlance ? (
                  <Section360
                    data-glance=""
                    label="At a glance"
                    className="gap-3 recipe:gap-6"
                  >
                    {/* Two columns, not the design's three-across row: it
                        draws YIELD/TOTAL/ACTIVE and §10.2.3 asks for a
                        fourth, and four 9px labels in a 340px aside is 85px
                        each — `ACTIVE TIME` alone is wider than that. */}
                    <div className="grid w-full grid-cols-2 gap-x-5 gap-y-4 recipe:gap-x-7">
                      {rev.yieldQuantity ? (
                        <Stat
                          data-stat="yield"
                          size="md"
                          label="Yield"
                          /* R-SCR-05 — the SCALED yield. */
                          value={
                            <ScaledAmount
                              value={rev.yieldQuantity}
                              unit={rev.yieldUnit}
                            />
                          }
                        />
                      ) : null}
                      {rev.servings ? (
                        <Stat
                          data-stat="servings"
                          size="md"
                          label="Servings"
                          value={<ScaledAmount value={rev.servings} />}
                        />
                      ) : null}
                      {rev.totalTimeMinutes ? (
                        <Stat
                          data-stat="total-time"
                          size="md"
                          label="Total time"
                          /* R-SCR-06 — a time does not scale. */
                          value={formatDuration(rev.totalTimeMinutes, null)}
                        />
                      ) : null}
                      {rev.activeTimeMinutes ? (
                        <Stat
                          data-stat="active-time"
                          size="md"
                          label="Active time"
                          value={formatDuration(rev.activeTimeMinutes, null)}
                        />
                      ) : null}
                    </div>
                  </Section360>
                ) : null}

                {recipe.ingredients.length > 0 ? (
                  /* C-14 draws its own F/Section 360 head, because the
                     `3 / 16` tally in it is client state and R-CON-02
                     forbids handing a function back across the boundary. */
                  <IngredientChecklist
                    slug={recipe.slug}
                    revisionNumber={rev.revisionNumber}
                    lines={recipe.ingredients}
                  />
                ) : null}
              </>
            ) : undefined
          }
          /* ── Method: Why this revision · Method · Notes · Provenance ·
                 Related · Literature ─────────────────────────────────── */
          method={
            hasMethod ? (
              <>
                {rev.rationale ? (
                  /* `Reason for change` — the one block in the design that
                     carries a 3px accent rule and an inset. The `S6` marker
                     that sits in that inset belongs to the change
                     apparatus; see the file header. */
                  <div className="flex w-full shrink-0 flex-col items-start gap-3 border-l-accent py-0.75 pl-4 [border-style:solid] [border-width:0px_0px_0px_3px] recipe:pl-7">
                    <div className="flex w-full flex-row flex-wrap items-center gap-3">
                      <h2 className="m-0 text-10 leading-normal font-mono font-normal tracking-spine uppercase text-accent">
                        Why the {ordinal.toLowerCase()}
                      </h2>
                      {rev.revisionNumber > 1 ? (
                        <span className="text-09 font-mono tracking-label uppercase text-ink-3">
                          {revisionOrdinal(rev.revisionNumber - 1)} →{' '}
                          {ordinal.toLowerCase()}
                        </span>
                      ) : null}
                    </div>
                    <div className="w-full text-15 leading-180 font-sans text-ink recipe:text-16 recipe:leading-180">
                      <Markdown tone="inherit">{rev.rationale}</Markdown>
                    </div>
                  </div>
                ) : null}

                {/* No wrapper around the phases. `recipe-1280.html:1910`
                    draws `Phase Prep` (`:1958`), `Phase Cure` (`:2319`) and
                    `Phase Hang` (`:2877`) as DIRECT children of
                    `Panel — Method`, which is `gap-[ 40px ]` — the same 40px
                    that separates the method from Notes and Provenance. A
                    `gap-7` wrapper put them 28px apart instead, which is the
                    design's gap INSIDE a phase (each `Phase` is itself
                    `gap-[ 28px ]`) and is already written on the phase and on
                    its step list below. */}
                {phases.length > 0
                  ? phases.map((group, index) => {
                      /* R-SCR-09 — the numbering runs continuously across
                         the phases, so "step five" is unambiguous. */
                      const before = phases
                        .slice(0, index)
                        .reduce((total, g) => total + g.steps.length, 0);
                      return (
                        <div
                          key={`${group.phase}-${index}`}
                          className="flex w-full shrink-0 flex-col items-start gap-5 recipe:gap-7"
                        >
                          {/* The phase head: a 24px serif italic title, a
                              hairline that fills the row, and a mono count.
                              Absent when the revision declares no phase
                              (R-STA-05). */}
                          {group.phase ? (
                            <div className="flex w-full flex-row items-center gap-4">
                              <h3 className="m-0 text-21 leading-normal font-serif font-medium tracking-flat text-ink italic recipe:text-24">
                                {group.phase}
                              </h3>
                              <span
                                aria-hidden="true"
                                className="h-px flex-1 bg-hair"
                              />
                              <span className="text-09 font-mono tabular-nums tracking-label uppercase text-ink-3">
                                {group.steps.length}{' '}
                                {group.steps.length === 1 ? 'step' : 'steps'}
                              </span>
                            </div>
                          ) : null}
                          <ol className="m-0 flex w-full list-none flex-col items-start gap-5 p-0 recipe:gap-7">
                            {group.steps.map((step, stepIndex) => (
                              <Step
                                key={step.id}
                                step={step}
                                number={before + stepIndex + 1}
                                letter={
                                  group.phase
                                    ? (PHASE_LETTERS[index] ?? null)
                                    : null
                                }
                                lines={recipe.ingredients}
                              />
                            ))}
                          </ol>
                        </div>
                      );
                    })
                  : null}

                {otherNotes.length > 0 ? (
                  <Band label="Notes" meta={String(otherNotes.length)}>
                    {otherNotes.map((note, index) => (
                      <NoteEntry key={note.id} note={note} number={index + 1} />
                    ))}
                  </Band>
                ) : null}

                {recipe.originNote ? (
                  /* WHY THIS IS NOT `F/Provenance line`, which M4 built for
                     this screen and which therefore has no call site.

                     The blocking reason is the markup, not the missing date:
                     `ProvenanceLine` renders its children inside a `<p>`
                     (`f/provenance.tsx:68`) and `<Markdown>` emits `<p>`, so
                     reusing it here would nest a paragraph in a paragraph.
                     Fixing that means giving the component a plain-body
                     option, which is an M4 edit and out of M5's scope.

                     The second reason stands on its own: the design's row is
                     a 110px date gutter beside one sentence, and
                     `recipes.origin_note` is a single markdown field with no
                     date beside it, so the row would be drawn with an empty
                     gutter. `date` is optional (`f/provenance.tsx:49`), so
                     that alone would not have blocked it.

                     The body role is identical either way — 14/24 Geist in
                     the primary ink, `f/provenance.tsx:45`. What is lost is
                     the gutter and the 9px row padding. M7 owns both. */
                  <Band label="Provenance">
                    <div className="w-full text-14 leading-170 font-sans text-ink">
                      <Markdown tone="inherit">{recipe.originNote}</Markdown>
                    </div>
                  </Band>
                ) : null}

                {related.length > 0 ? (
                  <Band label="Related" meta={String(related.length)}>
                    <CardGrid columns={2}>
                      {related.map((link) => (
                        <RecipeCard
                          key={link.key}
                          kind={link.recipe.kind}
                          code={link.label}
                          title={link.recipe.title}
                          href={`/recipes/${link.recipe.slug}`}
                          subtitle={link.recipe.subtitle}
                          summary={link.note ?? link.recipe.summary}
                        />
                      ))}
                    </CardGrid>
                  </Band>
                ) : null}

                {/* R-SCR-38 — absent when the recipe cites nothing, which is
                    most recipes. */}
                {citations.length > 0 ? (
                  <Band
                    label="Literature"
                    meta={String(citations.length)}
                    bodyClassName="gap-5"
                  >
                    {citations.map((source, index) => (
                      <Citation
                        key={index}
                        code={`[${index + 1}]`}
                        work={source.title}
                        part={source.citation}
                        accessedAt={source.accessedAt}
                        url={source.url}
                      />
                    ))}
                  </Band>
                ) : null}
              </>
            ) : (
              /* R-STA-03. `method` is the one panel §10.2.2 says is always
                 present, so it states its emptiness rather than opening
                 blank. */
              <Empty>No method recorded for this revision yet.</Empty>
            )
          }
          /* ── Science: Batch logs · The science ──────────────────────── */
          science={
            hasScience ? (
              <>
                {recipe.experiments.length > 0 ? (
                  <Band
                    label="Batch logs"
                    meta={String(recipe.experiments.length)}
                    bodyClassName="gap-0"
                  >
                    {recipe.experiments.map((experiment) => (
                      <BatchLine
                        key={experiment.slug}
                        lead={stamp(experiment.startedAt)}
                        title={experiment.title}
                        /* The nested address, not the top level one. We are
                           inside the recipe, so the recipe slug is in hand
                           and this is the run's own canonical address. See
                           D-01. */
                        href={`/recipes/${recipe.slug}/batch-logs/${experiment.slug}`}
                      />
                    ))}
                  </Band>
                ) : null}

                {science.length > 0 ? (
                  /* R-SCR-11 — five differences from a note at once: an
                     accent code in the gutter, a Newsreader claim at weight
                     400 rather than 500, a body set in the SERIF rather
                     than the sans, a trailing conditions row, and 32px
                     between entries rather than 16. F/Mechanism carries all
                     five; nothing here restates them. */
                  <Band
                    data-science=""
                    label="The science"
                    meta={String(science.length)}
                    bodyClassName="gap-8"
                  >
                    <p className="m-0 w-full text-15 leading-170 font-sans text-ink-2">
                      What is actually happening in the dish, and why the
                      techniques work.
                    </p>
                    {science.map((note, index) => (
                      <Mechanism
                        key={note.id}
                        data-kind={note.kind}
                        code={`M${index + 1}`}
                        name={note.title}
                      >
                        <Markdown tone="inherit">{note.body}</Markdown>
                      </Mechanism>
                    ))}
                  </Band>
                ) : null}
              </>
            ) : undefined
          }
          /* ── Revisions: the timeline ────────────────────────────────── */
          revisions={
            recipe.revisions.length > 1 ? (
              <Band
                data-timeline=""
                label="Revisions"
                meta={String(recipe.revisions.length)}
                bodyClassName="gap-0"
              >
                <p className="m-0 w-full max-w-155 text-15 leading-170 font-sans text-ink-2">
                  A revision is never edited and never removed. Beside each is a
                  sentence describing what the dish became — the part a cook can
                  act on.
                </p>
                {recipe.revisions.map((entry) => {
                  const viewing = entry.revisionNumber === rev.revisionNumber;
                  const current =
                    entry.revisionNumber === currentRevisionNumber;
                  return (
                    <Revision
                      key={entry.revisionNumber}
                      data-revision={entry.revisionNumber}
                      revisionNumber={entry.revisionNumber}
                      /* R-SCR-08: `occurredAt` is when the version EXISTED
                         and `createdAt` is when it was written down. A
                         backfilled entry says both. */
                      date={stamp(entry.occurredAt ?? entry.createdAt)}
                      /* No link on the entry a reader is already on. The
                         design gives the timeline no "you are here" state
                         at all; the absent link is the one cue that costs
                         nothing and cannot be misread. */
                      href={
                        viewing
                          ? undefined
                          : current
                            ? `/recipes/${recipe.slug}`
                            : `/recipes/${recipe.slug}/revisions/${entry.revisionNumber}`
                      }
                      /* R-SCR-07. */
                      current={current}
                      /* R-SCR-08. */
                      backfilled={entry.backfilled}
                      backfilledNote={
                        entry.backfilled && entry.occurredAt
                          ? `written down ${citationDate(entry.createdAt)}`
                          : undefined
                      }
                    >
                      {entry.rationale ?? (
                        <span className="text-ink-3">
                          No rationale recorded.
                        </span>
                      )}
                    </Revision>
                  );
                })}
              </Band>
            ) : undefined
          }
        />
      </div>
    </ScaleProvider>
  );
}

/**
 * One entry of the numbered apparatus.
 *
 * The kind decides which of F/Warning and F/Footnote draws it and which of
 * the three severity tones it takes; `noteKindLabel` supplies the
 * `SEVERITY · KIND` run. Eight kinds, three drawn treatments — R-CMP-06,
 * and the map lives in `f/mark.tsx` and nowhere else.
 */
function NoteEntry({ note, number }: { note: NoteView; number: number }) {
  const severity = noteSeverity(note.kind);
  const body = <Markdown tone="inherit">{note.body}</Markdown>;

  return severity === 'warning' ? (
    <Warning data-kind={note.kind} marker={number} title={note.title}>
      {body}
    </Warning>
  ) : (
    <Footnote
      data-kind={note.kind}
      severity={severity}
      marker={number}
      kind={noteKindLabel(note.kind)}
      title={note.title}
    >
      {body}
    </Footnote>
  );
}
