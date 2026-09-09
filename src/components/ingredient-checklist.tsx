'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';

import { useAnnounce } from '@/lib/announce';
import { formatQuantity } from '@/lib/domain/units';
import type { IngredientLineView } from '@/lib/queries/read';
import { CATEGORY_LABELS, categoryRank } from '@/lib/site';
import { cn } from '@/lib/utils';

import { FOCUS_RING } from './f/button';
import { IngredientRow } from './f/ingredient-row';
import { Section360 } from './f/section-label';
import { scaleAmount, useScale } from './scale';

/**
 * C-14 — a recipe's ingredients as a tickable list.
 *
 * Read from `design/exports/recipe-1280.html`:
 *   Ingredients aside  line 894   (`w-[ 340px ]`, a 24px column)
 *   Ingredients head   line 966   (the accent label and the `3 / 16` count)
 *   Order              line 987   (two halves of one row, `flex:1 1 0`)
 *   Groups             line 1014  (20px apart; a 9px quiet heading, no rule)
 *   Clear              line 1861  (`CLEAR THREE TICKS`, bare text)
 *   Batch control      line 778   (inside `Control bar`, ABOVE `Recipe body`)
 * and at 360 from `design/exports/recipe-360.html:455` (the head, the order
 * and the groups) and `:231` (the same control bar, above the tab rail).
 * The dark counterpart is `recipe-1280-dark.html` at the same lines: every
 * value there is the same token as the light one, so no `dark:` class exists
 * in this file.
 *
 * Two orderings, because they answer different questions:
 *
 * - **Shop order** groups by ingredient category, so a list is walked the
 *   way a shop is: produce, then meat, then spices. This is the default —
 *   it is what you want standing in an aisle.
 * - **As written** keeps the recipe's own component grouping ("Wash",
 *   "Dredge", "Duxelles") in the order it was recorded. That grouping is
 *   load-bearing for a multi-part recipe and would be lost if category
 *   order were the only view, so it stays one click away.
 *
 * Ticks persist per revision in localStorage. Per *revision* deliberately:
 * a recipe that gains an ingredient should not show it pre-ticked because
 * something with the same name was ticked in an older version.
 *
 * Scaling multiplies the amounts in place rather than writing a new
 * revision. Cooking half a batch is not a change to the recipe, and a
 * revision per batch size would bury the revisions that say something.
 * It is deliberately not persisted (R-STO-07): the scale you used last week
 * is not a safe default for a recipe you are reading today, and the recipe's
 * own quantities are what the page should say when you arrive.
 *
 * ── THE THREE THINGS M5 MOVED ─────────────────────────────────────────────
 *
 * 1. THE BATCH CONTROL LEFT THIS FILE. The design does not draw it in the
 *    Ingredients panel. It draws it in `Control bar`, between the hero and
 *    `Recipe body` at 1280 and above `Tab rail` at 360 — the same side of
 *    the line as **Add to list**. That is not a styling preference: at or
 *    below 900px the browser hides the inactive panel, so a reader who
 *    chose Method could not change the batch and the control measured 0×0.
 *    It is the identical fault class that R-SCR-03 and R-SCR-04 exist for,
 *    on a different control, and the step chips show scaled amounts
 *    (R-SCR-31), so Method is exactly where a reader wants it.
 *
 *    It is `BatchControl` in `src/components/scale.tsx` now, rendered by
 *    `recipe-detail.tsx` in the control bar. C-15 already owned the value,
 *    the control bar is not part of the checklist, and putting it there
 *    added no tenth `'use client'` file. §9.3's C-14 wording — "two orders,
 *    **a batch control**, a count and a clear control" — is spec drift as
 *    of M5, and so is C-15's "none. It has no user interface."
 *
 * 2. THE COUNT MOVED INTO THE SECTION HEADING. The design puts `3 / 16` at
 *    the right edge of the `INGREDIENTS` rule, not beside the order control.
 *    The heading therefore belongs to this client component: the count is
 *    client state and a Server Component cannot pass a function back across
 *    the boundary to fetch it (R-CON-02).
 *
 * 3. THE ROWS ARE `F/Ingredient row`. `f/ingredient-row.tsx` draws them,
 *    including the tick box, its border (TOKEN-MAP §7's 1.4.11 fix) and its
 *    25px hit area. This file composes and never redraws them. Two
 *    consequences the design settles and the old stylesheet got wrong: the
 *    ticked state is three colour swaps with NO strikethrough, and the unit
 *    is its own cell with a real space before it (R-CMP-14's class of
 *    fault).
 */

/* ── Numbers as words ──────────────────────────────────────────────────── */

/*
 * The design splits digits from words, consistently, across all eighteen
 * exports. A ratio or a progress readout is digits — `3 / 16`, `6 OF 6`,
 * `9 OF 24 IN THE TROLLEY`. A phrase that names a quantity of things spells
 * the number — `CLEAR THREE TICKS`, `SIX REVISIONS`, `TWENTY-SEVEN
 * INGREDIENTS`, `FIFTY TAGS`, `THIRTY INGREDIENTS · SIX AISLES`. Both
 * appear on this screen, eight hundred pixels apart, so both are written.
 *
 * The words stop at ninety-nine and a numeral takes over. That is the same
 * ruling `revisionOrdinal` makes in `src/lib/site.ts:157`, one order of
 * magnitude further out because the design itself draws `TWENTY-SEVEN` and
 * `FIFTY` where it never draws a revision past the sixth.
 *
 * It is local to this file rather than in `src/lib/site.ts` because that
 * file is not in M5's scope. If a second screen ever needs a cardinal, move
 * it there beside `revisionOrdinal` — one word list, not two.
 */
const CARDINALS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];

const TENS = [
  '',
  '',
  'twenty',
  'thirty',
  'forty',
  'fifty',
  'sixty',
  'seventy',
  'eighty',
  'ninety',
];

/** `3` → `three`; `27` → `twenty-seven`; `120` → `120`. */
function cardinal(n: number): string {
  if (!Number.isInteger(n) || n < 0) return String(n);
  if (n < 20) return CARDINALS[n]!;
  if (n < 100) {
    const tens = TENS[Math.floor(n / 10)]!;
    const ones = n % 10;
    return ones === 0 ? tens : `${tens}-${CARDINALS[ones]!}`;
  }
  return String(n);
}

/* ── Storage ───────────────────────────────────────────────────────────── */

/** R-STO-06 and §12: the revision is in the key, not only the slug. */
function storageKey(slug: string, revisionNumber: number): string {
  return `nn:checked:${slug}:${revisionNumber}`;
}

function readTicks(key: string): Set<string> | null {
  try {
    const stored = window.localStorage.getItem(key);
    if (!stored) return new Set();
    return new Set(JSON.parse(stored) as string[]);
  } catch {
    // Private mode, blocked storage, corrupt JSON — an unticked list is a
    // perfectly good fallback, so there is nothing to report.
    return null;
  }
}

function sameTicks(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}

/* ── The controls ──────────────────────────────────────────────────────── */

/**
 * WCAG 1.4.11, spent a third time.
 *
 * The unselected half of the order toggle is `f-desk` sitting on the
 * `f-paper` page. TOKEN-MAP §7 measures that pair at 1.12:1 light and 1.06:1
 * dark, against the 3:1 that 1.4.11 asks of a user interface component, and
 * the design draws no boundary of any kind. The precedent is set twice —
 * `input` is `f-ink-3` at 5.25:1 / 5.60:1, and `f/field.tsx:79` and
 * `f/ingredient-row.tsx:83` both spend it — so this file spends it again
 * rather than inventing a treatment. The tick box carries the same fix
 * already, inside F/Ingredient row.
 *
 * THE SELECTED HALF CARRIES A BORDER TOO, in its own ground colour. It does
 * not need one for contrast (`f-accent` is 8.06:1 / 6.92:1), but without it
 * the two halves of the toggle differ by two pixels of height and the row
 * jumps as a reader presses it.
 */
const CONTROL_EDGE = 'border border-solid border-input';
const CONTROL_EDGE_ON = 'border border-solid border-accent';

/*
 * `appearance-none`, `rounded-none`, `border-0` and `m-0` are not
 * decoration. Tailwind's preflight is OFF until M7 (BUILD-PLAN §3.1), so a
 * bare `<button>` still carries the user agent's own border, ground, radius
 * and font. Each one has to be answered by a utility or the old rule draws
 * it.
 */
const RESET = 'appearance-none rounded-none border-0 m-0';

/* The order control. Two halves of one row, `flex:1 1 0` each, 10px mono at
   1.2px — 9px at 360. R-ACC-08: both carry `aria-pressed`, and the DOM text
   stays sentence-case under the `uppercase` utility so `Shop order` and
   `As written` remain the accessible names. */
const ORDER_BUTTON = cn(
  RESET,
  'flex flex-1 basis-0 cursor-pointer items-center justify-center',
  'py-2 text-09 font-mono tracking-label uppercase recipe:text-10',
  FOCUS_RING,
);

/* 9px at 1280, 8px at 360 — the single place the recipe's own breakpoint
   changes the checklist's type (`recipe-360.html:519` against
   `recipe-1280.html:1022`). `m-0`, `font-normal` and `leading-normal` answer
   `globals.css:124`, which still sets a margin, a line height and a letter
   spacing on every `h4` until M7. The heading is `f-ink-3` and NOT the
   accent: `globals.css:1102` draws it accent with an accent-tinted rule
   under it, and the design has neither the colour nor the rule.

   `h3`, one level under F/Section 360's own `h2`. It was an `h4` under a
   heading-less `<span>`, so the outline of the primary screen went from the
   `h1` straight to an `h4` with nothing in between. `globals.css:141` gives
   `h3` a font size where `h4` had none, so `text-08`/`recipe:text-09`
   answers that too. */
const GROUP_HEAD = cn(
  'm-0 text-08 leading-normal recipe:text-09',
  'font-mono font-normal tracking-spine uppercase text-ink-3',
);

type Group = {
  key: string;
  label: string;
  items: { line: IngredientLineView; reference: string }[];
};

export type IngredientChecklistProps = {
  slug: string;
  revisionNumber: number;
  lines: IngredientLineView[];
};

export function IngredientChecklist({
  slug,
  revisionNumber,
  lines,
}: IngredientChecklistProps) {
  const [byShop, setByShop] = useState(true);
  // Shared, not local: the yield in "At a glance", the step chips and the
  // batch control all read the same value, so the page cannot state two
  // batch sizes at once (R-CMP-11).
  const { scale } = useScale();
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);

  const key = storageKey(slug, revisionNumber);

  // R-STO-02. Read after mount, never during render: the server has no
  // localStorage, and seeding state from it directly would mismatch the
  // hydrated markup.
  useEffect(() => {
    const stored = readTicks(key);
    if (stored) setChecked(stored);
    setReady(true);
  }, [key]);

  // R-STO-01. A failed write just means this visit's ticks do not survive a
  // reload, which is not worth interrupting a cook over.
  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(key, JSON.stringify([...checked]));
    } catch {
      // Ticking still works for this visit; it just will not survive a
      // reload. Not worth interrupting the cook over.
    }
  }, [checked, ready, key]);

  /*
   * R-STO-03 — two tabs stay in step.
   *
   * NEW IN M5, and the one behaviour this rebuild adds rather than carries:
   * the checklist had no `storage` listener before, so a phone in the
   * kitchen and a laptop on the counter drifted apart. §12 makes it a MUST.
   *
   * The equality check is load-bearing, not a micro-optimisation. Without
   * it, applying a remote change re-runs the write effect, which fires a
   * `storage` event in the other tab, which applies it back — two tabs
   * writing the same value at each other forever. Comparing first ends the
   * exchange on the first round.
   *
   * `event.key === null` is a `localStorage.clear()`, which the spec reports
   * with a null key and a null value.
   */
  useEffect(() => {
    if (!ready) return;
    function onStorage(event: StorageEvent) {
      // `storageArea` is optional in the type and absent in a few engines,
      // so it narrows the event when it is there and never gates on absence.
      if (event.storageArea && event.storageArea !== window.localStorage)
        return;
      if (event.key !== null && event.key !== key) return;
      const stored = readTicks(key);
      if (!stored) return;
      setChecked((previous) =>
        sameTicks(previous, stored) ? previous : stored,
      );
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [key, ready]);

  function toggle(id: string) {
    setChecked((previous) => {
      // A copy, not a mutation: React compares by identity, and a mutated
      // Set is the same object, so nothing would re-render.
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const groups = useMemo<Group[]>(() => {
    const built: { key: string; label: string; items: IngredientLineView[] }[] =
      [];

    if (byShop) {
      const map = new Map<string, IngredientLineView[]>();
      for (const line of lines) {
        const category = line.ingredient?.category ?? 'other';
        const list = map.get(category) ?? [];
        list.push(line);
        map.set(category, list);
      }
      built.push(
        ...[...map.entries()]
          .sort(
            ([a], [b]) =>
              categoryRank(a) - categoryRank(b) || a.localeCompare(b),
          )
          .map(([category, items]) => ({
            key: category,
            label: CATEGORY_LABELS[category] ?? category,
            items: [...items].sort((a, b) =>
              (a.ingredient?.name ?? a.rawText).localeCompare(
                b.ingredient?.name ?? b.rawText,
              ),
            ),
          })),
      );
    } else {
      // Written order, preserving the recipe's own components. A line with
      // no component keeps its place under no heading: the design draws no
      // such case, so nothing is invented for it.
      const map = new Map<string, IngredientLineView[]>();
      for (const line of lines) {
        const component = line.component ?? '';
        const list = map.get(component) ?? [];
        list.push(line);
        map.set(component, list);
      }
      built.push(
        ...[...map.entries()].map(([component, items]) => ({
          key: component || 'main',
          label: component,
          items,
        })),
      );
    }

    /* The 24px catalogue column runs `01 02 … 16` straight down the rendered
       list — verified against all sixteen `Ref` values in
       `recipe-1280.html:1014`. It is a display index, so it restarts at one
       when the order changes, and it is NOT `line.position`, which is the
       revision's own numbering and does not follow a shop. */
    let n = 0;
    return built.map((group) => ({
      ...group,
      items: group.items.map((line) => {
        n += 1;
        return { line, reference: String(n).padStart(2, '0') };
      }),
    }));
  }, [lines, byShop]);

  const done = lines.filter((line) => checked.has(line.id)).length;

  /* R-ACC-06, through the document's one live region rather than a second
     one here: `src/lib/announce.ts:5` records why there is exactly one and
     why a local `aria-live` breaks the 360 drawer. `ready` is the hydration
     flag — the ticks restored from storage on arrival are the baseline, not
     an announcement. */
  useAnnounce(`${done} of ${lines.length} ingredients ticked`, ready);

  return (
    /*
     * F/Section 360 draws the head: an `h2` carrying the accent micro-label,
     * the hairline, and the quiet count at the right edge. The meta's 1.2px
     * tracking and the heading element are both in `f/section-label.tsx` now
     * — the head is the block heading of the aside, and it was a `<span>`
     * inside an unnamed `<section>`. One delta is left: the 1280 head is
     * padded `p-[ 8px_0px ]` where `Section360` writes `pb-1.75`, which
     * `recipe:pt-2` answers on the section, one pixel out at the bottom.
     *
     * The single child is deliberate: `Section360` wraps its children in a
     * fixed 16px column, and one child makes that gap inert so this file can
     * state the design's own 24px at 1280 and 16px at 360.
     */
    <Section360
      data-checklist=""
      label="Ingredients"
      meta={`${done} / ${lines.length}`}
      className="gap-3 recipe:gap-6 recipe:pt-2"
    >
      <div className="flex w-full flex-col items-start gap-4 recipe:gap-6">
        <div
          role="group"
          aria-label="Order"
          className="flex h-fit w-full shrink-0 flex-row items-center gap-1"
        >
          <button
            type="button"
            onClick={() => setByShop(true)}
            aria-pressed={byShop}
            className={cn(
              ORDER_BUTTON,
              byShop
                ? cn('bg-accent text-on-accent', CONTROL_EDGE_ON)
                : cn('bg-desk text-ink-2', CONTROL_EDGE),
            )}
          >
            Shop order
          </button>
          <button
            type="button"
            onClick={() => setByShop(false)}
            aria-pressed={!byShop}
            className={cn(
              ORDER_BUTTON,
              byShop
                ? cn('bg-desk text-ink-2', CONTROL_EDGE)
                : cn('bg-accent text-on-accent', CONTROL_EDGE_ON),
            )}
          >
            As written
          </button>
        </div>

        {/* 20px between groups at 1280, 16px at 360. The heading has no rule
            under it and the group has no ground: the 20px and the 8px of row
            padding are the whole separation the design draws. */}
        <div className="flex w-full flex-col items-start gap-4 recipe:gap-5">
          {groups.map((group) => (
            <div
              key={group.key}
              data-group={group.key}
              className="flex w-full flex-col items-start gap-1"
            >
              {group.label ? (
                <h3 className={GROUP_HEAD}>{group.label}</h3>
              ) : null}
              {/* `role="list"` and `role="listitem"` rather than `<ul>` and
                  `<li>`: F/Ingredient row is a `<div>` and the design draws
                  no list markers, but sixteen ingredients are a list and a
                  screen reader should still say how many. */}
              <div role="list" className="flex w-full flex-col items-start">
                {group.items.map(({ line, reference }) => {
                  const label = line.ingredient?.name ?? line.rawText;
                  const isChecked = checked.has(line.id);

                  // The unit goes with the number into the scaling, so a
                  // count is rounded like a count and a mass like a mass.
                  const amount = formatQuantity(
                    line.quantity == null
                      ? line.quantity
                      : scaleAmount(line.quantity, scale, line.unit),
                    line.quantityMax == null
                      ? line.quantityMax
                      : scaleAmount(line.quantityMax, scale, line.unit),
                  );

                  /* §10.2.6's "(optional)" mark goes into `mark`, which is
                     F/Ingredient row's `NAME_ROW` slot — the one the design
                     provisions and never fills. It must NOT go into `name`:
                     `name` renders inside the `<Link>`, so the link would be
                     named "Kombu (optional)" while pointing at the Kombu
                     ingredient page, which is not optional. §13.1 names
                     `--text-faint` as the mark's carrier, so the token is
                     settled even though the word occurs zero times in the
                     eighteen exports. */
                  const mark: ReactNode = line.optional ? (
                    <span className="text-09 font-mono tracking-label uppercase text-ink-3">
                      (optional)
                    </span>
                  ) : undefined;

                  /* The note goes into `preparation`, which is the only
                     block under the name that the design draws. A `<span>`
                     and not a `<p>`: F/Ingredient row already renders a
                     paragraph, and a paragraph cannot hold one. The `{' '}`
                     between them is a real character, not a `block` display:
                     the span breaks the LINE, but `textContent` would still
                     read "cut into stripsand pat dry" without it (R-CMP-14's
                     fault class). */
                  const preparation: ReactNode =
                    line.preparation || line.note ? (
                      <>
                        {line.preparation}{' '}
                        {line.note ? (
                          <span className="block">{line.note}</span>
                        ) : null}
                      </>
                    ) : undefined;

                  return (
                    <IngredientRow
                      key={line.id}
                      role="listitem"
                      reference={reference}
                      amount={amount}
                      unit={line.unit}
                      name={label}
                      mark={mark}
                      href={
                        line.ingredient
                          ? `/ingredients/${line.ingredient.slug}`
                          : undefined
                      }
                      preparation={preparation}
                      ticked={isChecked}
                      onTick={() => toggle(line.id)}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* R-SCR-15: present only when something is ticked. Bare text on no
            ground at all — `f/button.tsx:18` names this shape and forbids
            reusing F/Button for it. The count beside it is `3 / 16` in
            digits and this one spells the number: see the note on
            `cardinal`. */}
        {done > 0 ? (
          <button
            type="button"
            data-clear-ticks=""
            onClick={() => setChecked(new Set())}
            className={cn(
              RESET,
              'cursor-pointer bg-transparent p-0 text-left',
              'text-09 font-mono tracking-label uppercase whitespace-nowrap',
              'text-ink-3',
              FOCUS_RING,
            )}
          >
            {done === 1 ? 'Clear one tick' : `Clear ${cardinal(done)} ticks`}
          </button>
        ) : null}
      </div>
    </Section360>
  );
}
