'use client';

import { useRef, useState, useSyncExternalStore, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { FOCUS_RING } from './f/button';

/**
 * C-13 — the panels of a recipe: what goes in, what you do, why it works,
 * and what changed.
 *
 * Two of these are always present and two are not, so the strip is built
 * from the panels this recipe actually has. A tab with nothing behind it is
 * a dead control, and most recipes carry neither a science note nor a
 * second revision (R-SCR-27).
 *
 * The layout differs by width, and deliberately:
 *
 * - On a phone every panel is a tab. Stacking them means scrolling past the
 *   whole ingredient list to reach step one and back up again every time
 *   you need a quantity.
 * - On a wide screen the ingredient list is an aside that stays put, and
 *   the tabs switch the main column between method, science and revisions.
 *   Side by side beats tabs when there is room for both: you can read an
 *   amount without leaving step four.
 *
 * ── THE SHAPE, AND WHY IT IS FLEX ──────────────────────────────────────
 *
 * `design/exports/recipe-1280.html` draws this screen as nested flex boxes
 * and there is no grid on it anywhere:
 *
 *   Recipe body       :891  flex flex-row gap-[ 60px ] items-start
 *     Ingredients aside :895  w-[ 340px ] shrink-0 flex flex-col gap-[ 24px ]
 *     Main column       :1868 [ flex:1_1_0 ] flex flex-col gap-0
 *       Tab rail          :1872 flex flex-row gap-[ 8px ] p-[ 0_0_10px_0 ] + 1px rule
 *       Panel — Method    :1910 flex flex-col gap-[ 40px ] p-[ 30px_60px_0_0 ]
 *
 * Three facts in that drawing decide the whole component.
 *
 * 1. THE STRIP IS INSIDE THE COLUMN, not beside the aside. R-SCR-28 is
 *    drawn, not merely written.
 * 2. THE COLUMN IS `gap-0`. The panel's box top IS the strip's box bottom,
 *    so R-ACC-13 at ≥901 is an equality and not a tolerance. The 30px of
 *    air above the method is `padding-top` INSIDE the panel box.
 * 3. THE COLUMN IS `flex:1 1 0` beside a `shrink-0` aside, so R-SCR-29 —
 *    a recipe with no aside uses the full width — is what happens when the
 *    aside is simply not rendered. It needs no rule of its own.
 *
 * ── WHY THE 2185px FAULT CANNOT COME BACK ──────────────────────────────
 *
 * The Revisions panel once started 2185px down the page, under an empty
 * screen, because `grid-row: 1 / -1` collapses to a single row when no rows
 * are declared, and an aside taller than the active panel then grew the row
 * that held the tab strip. The fix in `globals.css:902` declared named grid
 * areas — which makes the VALUE correct while leaving the PROPERTY, and a
 * later edit could put the span back.
 *
 * This rebuild removes the property instead:
 *
 * - There is no `display: grid` on this screen, so `grid-row`,
 *   `grid-column`, `grid-area` and `span` have nothing to apply to and
 *   `-1` has nothing to resolve against.
 * - The strip is not a SIBLING of the aside at any width ≥901. It is a
 *   grandchild of the container, inside `[data-recipe-column]`. "A tall
 *   aside grows the row holding the strip" has no referent when the strip
 *   is not in a row with the aside — the aside's height is absorbed by the
 *   flex line, and a flex line has no effect on the block flow INSIDE
 *   either item.
 * - The strip's own vertical position is fixed by the column: it is the
 *   column's first child, and the column's cross-start is the row's
 *   cross-start (`items-start`). No content anywhere can push it down.
 *
 * The old fault is unrepresentable here, not merely absent.
 *
 * ── ONE DOM, AND WHO OWNS WHAT (R-CMP-09, R-CMP-10) ────────────────────
 *
 * The element tree the server sends is the element tree at 360 and at 1280.
 * Every panel is rendered, always, and `display: none` from the stylesheet
 * decides what a reader sees — so ticks, the chosen order and the batch
 * value all survive a tab change (R-CMP-10), and a deep link or a Ctrl-F
 * still finds the method on a desktop.
 *
 *   CSS owns what is PAINTED. JS owns what is ANNOUNCED. Both read 901.
 *
 * The painted form is a pure function of `data-active` (and of the two tab
 * counts) plus the media query, so a reader with no JavaScript, and every
 * reader before hydration, gets the correct layout at every width.
 *
 * The ROLES cannot be a stylesheet's job — nothing in CSS rewrites an ARIA
 * attribute — and two of them are false at ≥901: the aside is not a
 * `tabpanel` there (no tab controls it, it is never hidden, and its
 * labelling tab is `display: none`), and a `tabpanel` with no `tablist` in
 * the document is not a tabpanel either. So one boolean, `wide`, flips
 * `role` on the aside, on the panels and on the strip after hydration.
 * That does not break R-CMP-09: the element tree is identical and the
 * pixels are still decided entirely by the stylesheet. Only the attributes
 * on those same nodes differ.
 *
 * ── THE CLASS NAMES THAT ARE STILL HERE ────────────────────────────────
 *
 * `recipe-layout`, `recipe-tabs` and `recipe-aside` are §9.4 names and
 * R-CMP-16 retires them — but `globals.css` survives until M7 (D-03) and
 * `e2e/recipe-layout.spec.ts` selects on all three. They are kept as
 * selectors only, with `data-recipe`, `data-tab-strip` and `data-tab` beside
 * them for the migration, and EVERY property the legacy rules set on them is
 * overwritten by a utility below. The legacy declarations that had to be
 * answered, all of them properties the design does not draw:
 *
 *   .recipe-layout   display:grid, grid-template-columns, gap, align-items
 *   .recipe-tabs     flex-wrap, gap, border-bottom, margin-bottom, and at
 *                    ≤900 padding, overflow-x, position, background
 *   .recipe-tabs b.  font, font-size, font-weight, padding, min-height,
 *                    border-bottom, border-radius, background, colour
 *   .recipe-aside    position, top, gap
 *
 * The utilities layer beats the legacy layer, so each is winnable — but
 * only for a property something here actually writes. `overflow-x: auto` on
 * the phone strip is the one that had to go rather than be inherited: the
 * design's four `flex-1` tabs fit 328px with room to spare, and an
 * `overflow-x` scroller that never scrolls is exactly the UNREACHABLE shape
 * R-ACC-11 exists for.
 */

const LABELS = {
  ingredients: 'Ingredients',
  method: 'Method',
  science: 'Science',
  revisions: 'Revisions',
} as const;

type TabKey = keyof typeof LABELS;

/* ── The one place 901 is read at runtime ───────────────────────────────── */

/**
 * `--breakpoint-recipe` is read from the document, never written as a
 * literal here.
 *
 * Tailwind emits an `@theme` breakpoint as a custom property on `:root`, so
 * the token in `src/app/theme.css` is legible to JS as well as to the
 * stylesheet. Writing `matchMedia('(min-width: 901px)')` beside it would put
 * the same number in two places, which is the fault `--breakpoint-shell`
 * was created to remove.
 *
 * The query is built once and cached: `matchMedia` allocates a live object,
 * and `useSyncExternalStore` needs `subscribe` and `getSnapshot` to agree on
 * the same one.
 */
let recipeWidth: MediaQueryList | null = null;

function recipeWidthQuery(): MediaQueryList | null {
  if (typeof window === 'undefined') return null;
  if (recipeWidth === null) {
    const width = getComputedStyle(document.documentElement)
      .getPropertyValue('--breakpoint-recipe')
      .trim();
    recipeWidth = window.matchMedia(`(width >= ${width || '901px'})`);
  }
  return recipeWidth;
}

function subscribeToWidth(onChange: () => void): () => void {
  const query = recipeWidthQuery();
  if (query === null) return () => {};
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function readWidth(): boolean {
  return recipeWidthQuery()?.matches ?? false;
}

/** The server, and the hydrating render, are narrow. There is no mismatch. */
function readWidthOnServer(): boolean {
  return false;
}

/* ── The boxes ──────────────────────────────────────────────────────────── */

/**
 * `Recipe body`. `items-stretch` at ≤900 is not decoration: `globals.css`
 * sets `align-items: start` at every width, and in a flex COLUMN that is the
 * horizontal axis, so every panel would shrink to its own content width.
 */
const LAYOUT = cn(
  'group/panels flex w-full',
  'max-recipe:flex-col max-recipe:items-stretch max-recipe:gap-7',
  'recipe:flex-row recipe:items-start recipe:gap-15',
);

/**
 * `Main column`, and the two things about it that are load-bearing.
 *
 * `min-w-0` replaces the grid's `minmax(0, 1fr)`. A flex item's `min-width`
 * defaults to `auto`, so one wide ingredient table or one long unbroken
 * token in the method would push the column past its share and scroll the
 * page sideways — R-STA-09, and a `page-overflow` major fault in
 * `pnpm audit:ui`. `flex-1` alone is NOT `minmax(0, 1fr)`.
 *
 * `contents` is scoped to `max-recipe:` and must never apply at ≥901. At
 * ≤900 it is required: the strip is `position: sticky`, and sticky sticks
 * only inside its containing block, which — while the aside carries the
 * active panel — would be a box only as tall as the strip itself.
 * Dissolving the column makes the strip's containing block the whole body.
 * The moment it applied at ≥901 the strip would become a sibling of the
 * aside again and R-SCR-28 would be broken silently.
 *
 * It also carries no role and no accessible name. `display: contents` has a
 * history of removing a named or roled element from the accessibility tree;
 * a bare `<div>` is safe and a `<section aria-label=…>` is not.
 */
const COLUMN = cn('flex min-w-0 flex-1 flex-col gap-0', 'max-recipe:contents');

/**
 * `Tab rail`. 1280: `gap-[ 8px ] p-[ 0_0_10px_0 ]` over a 1px `f-hair` rule.
 * 360: `gap-[ 4px ]`, no rule and no padding.
 *
 * Two deliberate departures from the drawing, both because a still artboard
 * cannot show them:
 *
 * - `bg-paper` at ≤900. The rail is sticky and has 4px gaps between filled
 *   tabs, so without a ground the body text scrolls through the gaps.
 *   (`globals.css` used `--bg-elevated`, which TOKEN-MAP §10.3 has already
 *   collapsed onto `f-paper` — the same colour, correctly named.)
 * - `overflow-visible`, written and not merely omitted, because the legacy
 *   `overflow-x: auto` still matches the class name that three tests need.
 *
 * THE RULE IS ONE FOUR-VALUE DECLARATION AND NOT `border-b border-solid`.
 * The preflight is off until M7 (BUILD-PLAN §3.1) and `globals.css` has no
 * universal border reset — its only `*` rule sets `box-sizing` — so a bare
 * `border-solid` sets `border-style` on ALL FOUR sides while `border-b`
 * gives only the bottom a width, and the other three take the CSS initial
 * `medium`. That drew a 3px `f-hair` box around the whole rail at every
 * width ≥901: the strip measured 39px against the design's 36, the tabs sat
 * 3px in from the panel they label, and the main column started 3px below
 * the aside. The export draws the four-value form itself
 * (`recipe-1280.html:1873`), and `recipe-detail.tsx`, `f/notice.tsx`,
 * `f/note.tsx`, `f/section-label.tsx` and `f/table-row.tsx` all write it.
 *
 * `max-recipe:border-b-0` stays. It answers the LEGACY `.recipe-tabs
 * { border-bottom: 1px solid var(--border) }` shorthand at `globals.css:870`,
 * which applies at every width until M7 — it was never neutralising the
 * declaration above it.
 */
const STRIP = cn(
  'recipe-tabs',
  'mb-0 flex w-full shrink-0 flex-row flex-nowrap items-center',
  'max-recipe:sticky max-recipe:top-[calc(var(--header-h,7rem)_+_0.5rem)]',
  'max-recipe:z-20 max-recipe:gap-1 max-recipe:overflow-visible',
  'max-recipe:border-b-0 max-recipe:bg-paper max-recipe:p-0',
  'recipe:static recipe:gap-2 recipe:bg-transparent recipe:pb-2.5',
  'recipe:[border-style:solid] recipe:[border-width:0px_0px_1px_0px] recipe:border-b-hair',
);

/**
 * R-SCR-30, generalised. The rule as written covers one case; the reasoning
 * covers three, and the arithmetic belongs in the component rather than in a
 * selector:
 *
 *   aside + Ingredients/Method      2 tabs on a phone, 1 on a desktop
 *   no aside + Method only          1 tab at both widths
 *   no aside + Method/Science       2 tabs at both widths
 *
 * `data-tabs` is what a phone offers and `data-desk-tabs` is what a desktop
 * offers, so the rule is one sentence at each width: hide the strip when its
 * own count is 1. A strip of one is not a choice.
 */
const STRIP_HIDDEN = cn(
  'group-data-[tabs=1]/panels:hidden',
  'recipe:group-data-[desk-tabs=1]/panels:hidden',
);

/**
 * A tab. 1280: `p-[ 6px_11px ]`, 10px mono at 1.5px, `w-fit`. 360:
 * `[ flex:1_1_0 ] p-[ 8px_0px ]` centred, 8px mono at 1.2px.
 *
 * `min-h-0`, `border-0`, `rounded-none` and `font-normal` are not
 * decoration: `globals.css:879` gives this button a 44px minimum height, a
 * 2px underline, an 8px top radius and `font-weight: 650`, and the design's
 * tab is a 25px filled block with none of them. `leading-normal` answers
 * `font: inherit`, which pulls the body's line-height in with everything
 * else.
 *
 * The 8px label clears the tap target at 360 by height, not by luck:
 * 8px + 8px of padding over a 10.4px line box is 26.4px, above the 24px
 * `scripts/audit-ui.ts` reports under.
 */
const TAB = cn(
  'm-0 flex cursor-pointer appearance-none flex-row items-center',
  'min-h-0 rounded-none border-0 p-0',
  'font-mono font-normal whitespace-nowrap uppercase',
  'max-recipe:flex-1 max-recipe:basis-0 max-recipe:justify-center',
  'max-recipe:px-0 max-recipe:py-2',
  'max-recipe:text-08 max-recipe:leading-normal max-recipe:tracking-label',
  'recipe:w-fit recipe:flex-none recipe:shrink-0 recipe:justify-start',
  'recipe:px-2.75 recipe:py-1.5',
  'recipe:text-10 recipe:leading-normal recipe:tracking-spine',
  FOCUS_RING,
);

/**
 * The selected ground, painted from two width-INDEPENDENT attributes.
 *
 * `data-on` is "this tab is the active one". `data-desk-on` is the same
 * question with the desktop's one resolution applied: the Ingredients tab is
 * not offered at ≥901, so an `ingredients` selection has to leave the main
 * column showing the method. Neither attribute knows the width — the media
 * query chooses between them — so the stylesheet still decides the pixels.
 *
 * Every rule here beats the one it must beat by SPECIFICITY and not by
 * source order: `[data-on=true]` adds an attribute selector, so the filled
 * state is (0,2,0) against the quiet state's (0,1,0). Relying on the order
 * Tailwind emits a media variant against a data variant would be a guess.
 *
 * Both grounds are the design's: `f-accent` under `f-on-accent` is 8.06:1
 * light and 6.92:1 dark; the quiet label is `f-ink-3`, 4.70:1 on `f-desk`
 * and 5.25:1 on the paper.
 */
const TAB_GROUND = cn(
  'text-ink-3',
  'max-recipe:bg-desk',
  'recipe:bg-transparent',
  'max-recipe:data-[on=true]:bg-accent max-recipe:data-[on=true]:text-on-accent',
  'recipe:data-[desk-on=true]:bg-accent recipe:data-[desk-on=true]:text-on-accent',
);

/**
 * `Panel — Method`: `p-[ 30px_60px_0px_0px ]` and `gap-[ 40px ]` at 1280, and no
 * padding at 360 where the page's own 28px gap does the work.
 *
 * `hidden` is the base and `flex` arrives with a variant, so the two are
 * never in the same `cn()` argument — `tailwind-merge` groups them together
 * and would drop the first one it saw.
 *
 * The panel does NOT set `items-start`, though the drawing does. The design
 * gives every child of this box `w-full`; the blocks this panel actually
 * receives are still `globals.css` sections, and cross-axis `flex-start`
 * would shrink every one of them to its own text width.
 */
const PANEL = cn(
  'box-border hidden w-full shrink-0 flex-col gap-10',
  'recipe:pt-7.5 recipe:pr-15',
);

/**
 * Which panel the stylesheet paints, given `data-active` alone.
 *
 * The second class on `method` is the desktop resolution of an
 * `ingredients` selection, which `globals.css:938` spells out as eight
 * enumerated pairs of selectors. Note what this buys: the painted form is a
 * pure function of an attribute that is already in the server HTML.
 *
 * `ingredients` has no entry: it is the aside, and it carries its own rule.
 */
const PANEL_SHOWN: Partial<Record<TabKey, string>> = {
  method: cn(
    'group-data-[active=method]/panels:flex',
    'recipe:group-data-[active=ingredients]/panels:flex',
  ),
  science: 'group-data-[active=science]/panels:flex',
  revisions: 'group-data-[active=revisions]/panels:flex',
};

/**
 * `Ingredients aside`: 340px, `shrink-0`, `gap-[ 24px ]`, and first in the
 * row.
 *
 * `-order-1` and not a DOM reorder. The column comes first in the markup so
 * that at ≤900 — where the column dissolves and the strip becomes a sibling
 * of the panels — the tablist precedes every panel it controls, which is
 * what the APG tabs pattern and R-ACC-07 ask for. At ≥901 the aside is no
 * longer a panel but a `complementary` landmark, and a landmark that follows
 * the main content in the reading order is the ordinary case for `<aside>`.
 *
 * Sticky under the measured header, never under a guess: `--header-h` is
 * published by C-20 because this header runs from 54px to 66px depending on
 * its content. The aside pinned at a hard 5rem once, under a header that was
 * 107.7px at 390.
 */
const ASIDE = cn(
  'recipe-aside',
  'box-border hidden w-full shrink-0 flex-col gap-6',
  'group-data-[active=ingredients]/panels:flex',
  'recipe:flex recipe:-order-1 recipe:w-85',
  'max-recipe:static',
  'recipe:sticky recipe:top-[calc(var(--header-h,7rem)_+_1rem)]',
);

/* ── The component ──────────────────────────────────────────────────────── */

export function RecipeTabs({
  ingredients,
  method,
  science,
  revisions,
}: {
  /**
   * Omitted by a recipe with nothing to put in the aside — a research
   * write-up carries no ingredients and no yield. It used to render the
   * aside anyway, which left a third of a desktop screen blank beside the
   * only column that had anything in it (R-SCR-29).
   */
  ingredients?: ReactNode;
  method: ReactNode;
  science?: ReactNode;
  revisions?: ReactNode;
}) {
  const [active, setActive] = useState<TabKey>(
    ingredients ? 'ingredients' : 'method',
  );

  /**
   * `false` on the server and on the hydrating render, then corrected. It
   * decides ARIA and keyboard behaviour and NOTHING ELSE — never a pixel,
   * never a branch in the markup.
   */
  const wide = useSyncExternalStore(
    subscribeToWidth,
    readWidth,
    readWidthOnServer,
  );

  const panels: { key: TabKey; content: ReactNode }[] = [];
  if (ingredients) panels.push({ key: 'ingredients', content: ingredients });
  panels.push({ key: 'method', content: method });
  if (science) panels.push({ key: 'science', content: science });
  if (revisions) panels.push({ key: 'revisions', content: revisions });

  const deskTabs = panels.length - (ingredients ? 1 : 0);

  /* Which tabs are on screen, and therefore which ones an arrow key may
     land on. Derived from `wide`, never from sniffing `offsetParent`. */
  const offered = panels.filter(
    (panel) => !(wide && panel.key === 'ingredients'),
  );

  /**
   * The strip is offered only while it has something to switch, and that is
   * the same condition the stylesheet paints it by (`STRIP_HIDDEN`), so the
   * roles and the pixels agree by construction. A `tabpanel` with no
   * `tablist` is not a tabpanel, so the panels lose their role with it.
   */
  const asTabs = offered.length > 1;

  /* Width-independent, so the stylesheet may read it: at ≥901 the
     Ingredients tab is painted out, and its selection resolves to method. */
  const deskActive: TabKey = active === 'ingredients' ? 'method' : active;
  const selected = wide ? deskActive : active;

  const buttons = useRef(new Map<TabKey, HTMLButtonElement | null>());

  /* R-ACC-07 implies the APG tabs pattern: one tab stop for the whole
     strip, and Left/Right/Home/End to move within it. Selection follows
     focus, which is the APG default when every panel is already mounted. */
  function move(from: TabKey, to: number | 'first' | 'last') {
    const keys = offered.map((panel) => panel.key);
    const at = keys.indexOf(from);
    if (at === -1) return;
    const index =
      to === 'first'
        ? 0
        : to === 'last'
          ? keys.length - 1
          : (at + to + keys.length) % keys.length;
    const key = keys[index];
    if (key === undefined) return;
    setActive(key);
    buttons.current.get(key)?.focus();
  }

  const focusable = offered.some((panel) => panel.key === selected)
    ? selected
    : offered[0]?.key;

  return (
    <div
      className={cn('recipe-layout', LAYOUT)}
      data-recipe=""
      data-active={active}
      data-tabs={panels.length}
      data-desk-tabs={deskTabs}
      /* `data-panels` and `data-aside` are read by `globals.css` until M7.
         They agree with the two counts above; they are a fallback, not the
         source of truth. */
      data-panels={panels.length}
      data-aside={ingredients ? 'yes' : 'no'}
    >
      {/* R-SCR-28. The strip and the panels it switches are ONE column. At
        ≤900 the column dissolves and they become siblings of the aside in
        the page's own stack; at ≥901 they are a `flex:1 1 0` item beside a
        `shrink-0` aside, and the aside cannot reach into it. */}
      <div data-recipe-column="" className={COLUMN}>
        <div
          className={cn(STRIP, STRIP_HIDDEN)}
          data-tab-strip=""
          role={asTabs ? 'tablist' : undefined}
          aria-label={asTabs ? 'Recipe' : undefined}
        >
          {panels.map((panel) => (
            <button
              key={panel.key}
              ref={(node) => {
                buttons.current.set(panel.key, node);
              }}
              type="button"
              role={asTabs ? 'tab' : undefined}
              id={`tab-${panel.key}`}
              aria-selected={asTabs ? selected === panel.key : undefined}
              aria-controls={`panel-${panel.key}`}
              tabIndex={panel.key === focusable ? 0 : -1}
              data-tab-button={panel.key}
              data-on={active === panel.key ? 'true' : 'false'}
              data-desk-on={deskActive === panel.key ? 'true' : 'false'}
              className={cn(
                TAB,
                TAB_GROUND,
                /* Not offered at ≥901: the aside is on screen at all
                   times, so a tab for it would switch the main column to a
                   duplicate of a list already beside it. Dropped rather
                   than disabled — a control that does nothing is worse
                   than one that is not there. */
                panel.key === 'ingredients' ? 'recipe:hidden' : undefined,
              )}
              onClick={() => setActive(panel.key)}
              onKeyDown={(event) => {
                const to =
                  event.key === 'ArrowRight'
                    ? 1
                    : event.key === 'ArrowLeft'
                      ? -1
                      : event.key === 'Home'
                        ? ('first' as const)
                        : event.key === 'End'
                          ? ('last' as const)
                          : null;
                if (to === null) return;
                event.preventDefault();
                move(panel.key, to);
              }}
            >
              {LABELS[panel.key]}
            </button>
          ))}
        </div>

        {/* Hidden, not unmounted (R-CMP-10): ticked checkboxes, the chosen
          ordering and the batch multiplier all survive a tab change. */}
        {panels
          .filter(
            (
              panel,
            ): panel is {
              key: Exclude<TabKey, 'ingredients'>;
              content: ReactNode;
            } => panel.key !== 'ingredients',
          )
          .map((panel) => (
            <div
              key={panel.key}
              id={`panel-${panel.key}`}
              data-tab={panel.key}
              role={asTabs ? 'tabpanel' : undefined}
              aria-labelledby={asTabs ? `tab-${panel.key}` : undefined}
              className={cn(PANEL, PANEL_SHOWN[panel.key])}
            >
              {panel.content}
            </div>
          ))}
      </div>

      {ingredients ? (
        <aside
          className={ASIDE}
          id="panel-ingredients"
          data-tab="ingredients"
          /* At ≥901 no tab controls this box and it is never hidden, so it
             is not a tabpanel — it is the `<aside>` element's own
             `complementary` landmark. HTML-AAM maps a scoped `<aside>` to
             that role only when it carries an accessible name, so the
             label is not optional: without it the landmark disappears at
             exactly the width where it is the reason the aside exists. */
          role={wide ? undefined : 'tabpanel'}
          aria-labelledby={wide ? undefined : 'tab-ingredients'}
          aria-label={wide ? 'Ingredients' : undefined}
        >
          {ingredients}
        </aside>
      ) : null}
    </div>
  );
}
