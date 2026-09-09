'use client';

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { formatQuantity, unitKind } from '@/lib/domain/units';
import { useAnnounce } from '@/lib/announce';
import { cn } from '@/lib/utils';

import { FOCUS_RING, FOCUS_RING_WITHIN } from './f/button';

/**
 * C-15 — the batch value for the whole recipe page, and the control that
 * changes it.
 *
 * The value used to be `useState` inside the ingredient checklist, which
 * meant nothing else could see it — and a value nobody else can see produces
 * numbers that contradict each other on the same screen. At ×3 the "At a
 * glance" table said "Yield 4.5 kg dried" while the readout beside the
 * scaler said "makes 13.5 kg". At ×999 it was 4.5 kg against 4496 kg.
 * Neither figure was wrong on its own; the page simply had two answers to
 * one question. R-CMP-11 is that fault written down.
 *
 * A client provider wrapping server-rendered children: the recipe body
 * stays a server component and still reads the context, because context
 * flows through the rendered tree rather than the module graph.
 *
 * ─── WHY THE USER INTERFACE IS IN THIS FILE ─────────────────────────────
 *
 * §9.3 says of C-15: "none. It has no user interface." That is no longer
 * true, and the change is deliberate. Record it as spec drift.
 *
 * The design does not put the batch control in the Ingredients panel. It
 * puts it in a `Control bar` between the hero and the recipe body —
 * `design/exports/recipe-1280.html:778`, above `Recipe body` at `:886`; at
 * 360 the same bar is at `recipe-360.html:231`, above `Tab rail` at `:328`.
 * The bar also carries the change toggle and ADD TO LIST, so the design has
 * put the batch control on the R-SCR-03 side of that line on purpose.
 *
 * It had to move. Rendered inside the checklist it sat inside the
 * `ingredients` tabpanel, and at 900px and under the browser hides the
 * panel that is not active: a reader on Method could not change the batch
 * and the control measured 0 × 0. That is the identical fault class
 * R-SCR-03 and R-SCR-04 exist for, on a different control — and the step
 * chips show scaled amounts (R-SCR-31), so Method is exactly where a reader
 * wants the control.
 *
 * It lives in `scale.tsx` rather than in a tenth `'use client'` file
 * because C-15 already owns the value, and because the control bar is not
 * part of the checklist. `src/components/` outside `ui/` holds nine client
 * files and this adds none.
 */

/* ── The value ─────────────────────────────────────────────────────────── */

interface ScaleState {
  scale: number;
  /** The raw text in the box, which is not always a number mid-typing. */
  raw: string;
  /**
   * The recipe's own serving count, when it declares one.
   *
   * When it does, the box counts servings rather than batches — "For 4"
   * is a question a cook can answer, where "×1" asks them to know what one
   * batch is before they can change it. When it does not, there is nothing
   * honest to count: a biltong recipe yields 4.5 kg dried and has no
   * servings at all, so the multiplier stays.
   */
  servings: number | null;
  setScale: (value: number) => void;
  setRaw: (value: string) => void;
  commit: () => void;
  /** Move the box by whole units — one serving, or ×0.5 without them. */
  step: (delta: number) => void;
}

/** R-SCR-36. Both ends, and both are enforced in three places; see below. */
const MIN_SCALE = 0.1;
const MAX_SCALE = 100;

const ScaleContext = createContext<ScaleState | null>(null);

function trim(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

export function ScaleProvider({
  servings,
  children,
}: {
  servings?: number | null;
  children: ReactNode;
}) {
  // What the box counts. Servings when the recipe has them, batches when it
  // does not — one control either way, because two would be two answers to
  // the same question again.
  const basis = servings != null && servings > 0 ? servings : 1;

  // The number the page renders, and the text the box shows, held apart.
  //
  // One controlled numeric value could not do both. "0.5" is typed one
  // character at a time, and "0" then "0." are not usable multipliers, so a
  // handler that only commits usable numbers rejected the keystrokes and
  // React snapped the box back — leaving the caret after the old digits so
  // the next keystroke appended. Measured: select all, then "0.5", produced
  // 1.5 and 15 kg of beef, the field could not be emptied at all, and a
  // second attempt gave "1.505". A half batch was unreachable by typing.
  const [scale, setScaleValue] = useState(1);
  const [raw, setRaw] = useState(trim(basis));

  const value = useMemo<ScaleState>(() => {
    const toBox = (next: number) => trim(next * basis);
    const fromBox = (boxValue: number) => boxValue / basis;

    const apply = (next: number) => {
      const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
      setScaleValue(clamped);
      setRaw(toBox(clamped));
    };

    return {
      scale,
      raw,
      servings: servings != null && servings > 0 ? servings : null,
      setScale: apply,
      setRaw: (next: string) => {
        setRaw(next);
        const parsed = Number(next);
        // Clamp the top on every keystroke — no route to a value at or
        // under the maximum passes through one above it — but never the
        // bottom, which would rewrite "0" into "0.1" mid-word and make
        // every sub-1 batch untypable.
        if (Number.isFinite(parsed) && parsed > 0) {
          setScaleValue(Math.min(MAX_SCALE, fromBox(parsed)));
        }
      },
      commit: () => {
        const parsed = Number(raw);
        const settled =
          Number.isFinite(parsed) && parsed > 0
            ? Math.min(MAX_SCALE, Math.max(MIN_SCALE, fromBox(parsed)))
            : scale;
        setScaleValue(settled);
        setRaw(toBox(settled));
      },
      step: (delta: number) => {
        // Step the box, not the scale: +1 on a four-serving recipe means
        // five servings, which is ×1.25 — stepping the multiplier instead
        // would jump to five batches. R-SCR-37.
        const current = scale * basis;
        // The step is one WHOLE serving whenever the recipe counts servings
        // at all, and ×0.5 only when it does not. Deriving it from `basis`
        // instead conflated "this recipe has servings" with "it has more
        // than one": a revision declaring `servings: 1` rendered Form A —
        // whose buttons are labelled "One more serving" and "One fewer
        // serving" (R-ACC-12) — and moved the box by half a serving, with
        // `Math.max(grid, next)` flooring it at 0.5 of one. R-SCR-37 says
        // one step is one serving.
        const grid = servings != null && servings > 0 ? 1 : 0.5;
        const next = Math.round(current / grid) * grid + delta * grid;
        apply(fromBox(Math.max(grid, next)));
      },
    };
  }, [scale, raw, basis, servings]);

  return (
    <ScaleContext.Provider value={value}>{children}</ScaleContext.Provider>
  );
}

export function useScale(): ScaleState {
  const context = useContext(ScaleContext);
  if (!context) {
    throw new Error('useScale must be used inside a ScaleProvider');
  }
  return context;
}

/**
 * Round a scaled amount to something you can measure.
 *
 * At ×1 the value is returned untouched. The rounding exists to stop a
 * scaled amount reading as 138.49999999999997; applying it to an unscaled
 * one silently rewrites the recipe, and 138.5 g of salt showed as "139 g"
 * on a page nobody had scaled.
 */
export function scaleAmount(
  value: number,
  scale: number,
  unit?: string | null,
): number {
  if (scale === 1) return value;
  const scaled = value * scale;

  // A count is a different kind of number from a mass. Half of three eggs
  // is 1.5 eggs and saying so is honest, but 1.5 is where it should stop —
  // rounding a count to three decimals produces "1.667 cloves", which is a
  // measurement nobody can act on. Mass and volume keep their precision
  // because 0.375 g of a spice is a real quantity.
  if (unitKind(unit) === 'count') {
    return Math.round(scaled * 100) / 100;
  }

  if (scaled >= 100) return Math.round(scaled);
  if (scaled >= 10) return Math.round(scaled * 10) / 10;
  return Math.round(scaled * 1000) / 1000;
}

/**
 * A quantity from the recipe, shown at the current batch size.
 *
 * Used for the yield and the servings in "At a glance", so those read the
 * same multiplier as the ingredient list rather than stating the recipe's
 * own figure beside a scaled one.
 *
 * R-CMP-16 — THE TWO §9.4 CLASS NAMES ARE GONE. The marker used to carry
 * `faint scale-marker`, which re-applied `globals.css` rules to a screen
 * this milestone rebuilt. `.faint` is `color: var(--text-faint)`, so
 * `text-ink-3` is the same colour under the design's own name and nothing
 * moves. `.scale-marker` had no rule at all and no selector anywhere.
 *
 * THE SUFFIX ITSELF STAYS, and it is a divergence from the drawing: "At a
 * glance" is a bare `4.5 kg` at `recipe-1280.html:911`. The design draws
 * that cell at ×1 only and has nothing to say about a scaled one, and a
 * figure that silently disagrees with the recipe's own stated yield is the
 * fault R-CMP-11 exists for. `e2e/shopping-journey.spec.ts:229` asserts the
 * marker. Deleting it belongs to whoever rebuilds "At a glance" as
 * `F/Measure`, in the same commit as that assertion.
 */
export function ScaledAmount({
  value,
  unit,
  suffix,
}: {
  value: number;
  unit?: string | null;
  suffix?: string;
}) {
  const { scale } = useScale();
  const scaled = scaleAmount(value, scale, unit);
  return (
    <>
      {formatQuantity(scaled)}
      {unit ? ` ${unit}` : ''}
      {suffix ?? ''}
      {scale !== 1 ? <span className="text-ink-3"> ×{scale} batch</span> : null}
    </>
  );
}

/* ── The control ───────────────────────────────────────────────────────── */

/**
 * The scales worth a button. `design/exports/foundations.html:3016–3086`
 * draws exactly these four, in this order, with ×1 filled.
 */
const SCALE_PRESETS = [0.5, 1, 2, 3];

/*
 * WHY THIS FILE DOES NOT USE `F/Button` OR `F/Field`.
 *
 * `f/button.tsx:18–22` forbids it in as many words: "Two things that look
 * like a button are not one, and M4 and M5 must not reuse this file for
 * them: the bare text control … and the batch preset chip (7px over 11px on
 * paper, 12px mono, the selected one filled)." F/Button is one shape —
 * 11px over 18px, a 10px mono label at 1.5px tracking, accent-filled — and
 * a `−` drawn that way is not the control the design draws. The stepper
 * button is 7px over 13px, 14px mono, `f-ink-2` on `f-paper`.
 *
 * F/Field is a label ABOVE a `f-desk` box in 14px Geist with `px-3 py-2.5`.
 * The batch field is an inline label BESIDE a `f-paper` box in 14px Geist
 * Mono with `px-3 py-1.75`. Four differences, none of them a prop.
 *
 * What is reused is the part that is genuinely shared and that a second
 * copy would let drift: `FOCUS_RING` and `FOCUS_RING_WITHIN` from
 * `f/button.tsx` (R-ACC-05), and the `border-input` boundary that
 * `f/field.tsx:79` and `f/ingredient-row.tsx:83` already spend. No second
 * Button component is defined here.
 */

/*
 * THE WCAG 1.4.11 BOUNDARY, for the third time in this build.
 *
 * Every cell of this control is `f-paper` sitting on the control bar's
 * `f-desk` ground. That pair is 1.12:1 light and 1.06:1 dark
 * (TOKEN-MAP.md §7 — the ratio is symmetric, it is the same pair as the
 * tick box on the page), against 1.4.11's 3:1. These are user interface
 * components, so 1.4.11 applies and the drawn treatment fails it.
 *
 * The precedent is set twice and this is the third use, not a new
 * invention: `border border-solid border-input`, where `input` is `f-ink-3`
 * — 5.25:1 light, 5.60:1 dark, and no new colour (TOKEN-MAP.md §5 item 5).
 *
 * `appearance-none`, `rounded-none` and the explicit ground, colour and
 * padding are not decoration either. Tailwind's preflight is OFF until M7
 * (BUILD-PLAN §3.1), and `globals.css:1327` still styles every
 * `input[type='text']` with a ground, a border, a radius, a padding and
 * `width: 100%`. It is in the `legacy` cascade layer so a utility wins on
 * layer order rather than on specificity, but only for the properties a
 * utility actually sets. Each one has to be answered.
 */
const CELL = cn(
  'appearance-none rounded-none bg-paper',
  'border border-solid border-input',
  'font-mono',
);

/*
 * The 901px variant, and why it is not `shell:`.
 *
 * §10.2.2 fixes 901px for the RECIPE layout. The shell's drawer swaps at
 * 1080. Both are correct and they are different numbers: at 768 the header
 * is a drawer AND the recipe is tabs; at 1024 the header is a drawer AND
 * the recipe is an aside. `--breakpoint-recipe` is declared in
 * `src/app/theme.css` beside `--breakpoint-shell` and mirrored in
 * `src/lib/utils.ts`, or `cn()` will not treat `text-11` and
 * `recipe:text-12` as separate groups.
 *
 * The base is the 360 drawing and `recipe:` is the 1280 one, because the
 * 360 form is the one that has to survive a narrow column.
 */

/* 9px over 0 at 360 (the cell grows instead); 7px over 13px at 1280. */
const STEP_BUTTON = cn(
  CELL,
  'inline-flex flex-1 items-center justify-center',
  'py-2.25 text-11 text-ink-2',
  'recipe:h-fit recipe:w-fit recipe:flex-none recipe:px-3.25 recipe:py-1.75 recipe:text-14',
  FOCUS_RING,
);

/*
 * The Form A field. The design writes `w-fit`, which an `<input>` cannot
 * honour — it would fall back to the user agent's 20-character default. The
 * box has to hold `100` (R-SCR-36's ceiling) and a typed `0.125`, so it
 * takes a fixed 60px above the breakpoint and grows with the stepper below
 * it. `justify-center` in the drawing becomes `text-center`: Form A's
 * number sits between two buttons, where Form B's is left-aligned.
 */
const FIELD_A = cn(
  CELL,
  'w-15 min-w-0 flex-1 py-2.25',
  'text-14 tabular-nums text-ink text-center',
  'recipe:flex-none recipe:px-4.5 recipe:py-1.75',
  FOCUS_RING,
);

/*
 * The Form B field, and the `×` that cannot be in the value.
 *
 * The drawing puts `×1` inside one box (`foundations.html:3086`). R-SCR-35
 * makes the control `type="text" inputMode="decimal"` and the parser is
 * `Number(next)`, which returns `NaN` for `"×1"` — so the glyph is a
 * separate `aria-hidden` span sharing the paper box with a bare `<input>`.
 * The box still reads `×1` on screen and the input value is `1`;
 * `e2e/shopping-journey.spec.ts` types into this box and asserts
 * `toHaveValue('0.5')`, `''` and `'100'`, so the value must stay bare.
 *
 * `gap-0` between the two: the design draws one text run, not two cells.
 * The focus ring is `FOCUS_RING_WITHIN` because the box carries the border
 * and the `<input>` inside it takes the focus.
 *
 * THE BOX IS A `<label>` AND NOT A `<div>`. The padding and the border are
 * on the box while the `<input>` inside it is `p-0 border-0`, so the input's
 * own border box is 56 × 18 inside a 90 × 34 control: as a `<div>` the 12px
 * of padding and the `×` glyph were dead pointer targets, and a press on
 * three quarters of what is drawn as one field focused nothing. The implicit
 * label association makes every pixel of the box focus the input. It costs
 * nothing in the accessible name — `aria-label` beats a wrapping label, and
 * the glyph is `aria-hidden` — and `pnpm audit:ui` cannot see this class of
 * fault, because `scripts/audit-ui.ts` never measures a text input.
 */
const FIELD_B_BOX = cn(
  CELL,
  'flex h-fit w-fit shrink-0 flex-row items-center gap-0 px-3 py-1.75',
  FOCUS_RING_WITHIN,
);

const FIELD_B_INPUT = cn(
  'w-14 min-w-0 appearance-none rounded-none border-0 bg-transparent p-0',
  'text-14 font-mono tabular-nums text-ink outline-none',
);

/*
 * The preset chip. 7px over 11px on paper at 1280, 12px mono; at 360 it
 * grows to a quarter of the row with 9px of block padding and an 11px
 * label.
 *
 * The selected chip is `bg-accent` at 8.06:1 / 6.92:1 and needs no boundary
 * of its own — but it needs the same border BOX as its neighbours or it
 * would sit two pixels short of them, so it takes `border-accent`: its own
 * ground, drawn as a border. Not `border-transparent`; `theme.css:97`
 * clears the colour namespace and that name emits nothing.
 */
const PRESET = cn(
  'inline-flex flex-1 items-center justify-center',
  'appearance-none rounded-none border border-solid',
  'py-2.25 text-11 font-mono tabular-nums',
  'recipe:h-fit recipe:w-fit recipe:flex-none recipe:px-2.75 recipe:py-1.75 recipe:text-12',
  FOCUS_RING,
);

const PRESET_ON = 'bg-accent border-accent text-on-accent';
const PRESET_OFF = 'bg-paper border-input text-ink-2';

/**
 * FOR and BATCH. 9px Geist Mono at `tracking-spine`, which is 1.5px — the
 * same label treatment F/Field uses, and NOT the 1.2px `tracking-label` of
 * the readout beside it. The design is consistent about this.
 *
 * The DOM text stays sentence case and `uppercase` draws it, which is the
 * convention M3 and M4 set across 41 uses in `src/components/f/`.
 */
const LABEL = cn(
  'text-09 font-mono tracking-spine uppercase whitespace-nowrap text-ink-3',
);

/*
 * The readout. 10px at 1280, 9px on its own row at 360, `tracking-label`.
 *
 * No `whitespace-nowrap`, although the drawing carries it. Every text node
 * in the exports carries `[ white-space:nowrap ]`, including Caption A and
 * Caption B, which are long sentences that visibly wrap in the export
 * itself — it is a Pencil artefact, not an instruction, and honouring it on
 * a growing string would push the 360 page sideways against R-STA-09.
 */
const READOUT = cn(
  'text-09 font-mono tabular-nums tracking-label uppercase text-ink-3',
  'recipe:text-10',
);

/**
 * The batch control — Form A or Form B, never both (R-SCR-34).
 *
 * Render it in the control bar above the tab strip, inside the same
 * `ScaleProvider` as the recipe body:
 *
 *     <ScaleProvider servings={rev.servings}>
 *       …hero…
 *       <div className="… bg-desk …">            {/ * the control bar * /}
 *         <BatchControl
 *           yieldQuantity={rev.yieldQuantity}
 *           yieldUnit={rev.yieldUnit}
 *         />
 *         <AddToBasket … />
 *       </div>
 *       <RecipeTabs … />
 *     </ScaleProvider>
 *
 * The bar supplies the `f-desk` ground and the padding
 * (`p-3.5 recipe:px-4.5 recipe:py-4`); this component supplies only itself,
 * so the bar can put ADD TO LIST on the other side of a `justify-between`.
 *
 * WHICH FORM, AND WHAT HAPPENS WHEN THE REVISION DECLARES NEITHER.
 *
 *   servings declared        → Form A, the servings stepper. The label is
 *                              FOR, one step is one serving.
 *   yield, no servings       → Form B, the batch multiplier. The label is
 *                              BATCH, the presets are ×0.5 ×1 ×2 ×3.
 *   neither declared         → Form B, with no readout.
 *
 * The third case is Form B and not "no control": a multiplier is honest
 * about a recipe that states nothing — "×2 of what is written" is always
 * true — where a stepper would have to count servings the recipe never
 * claimed, and would open on a number this build invented. The readout is
 * the only part that needs the yield, so it is simply absent. A recipe with
 * nothing to scale at all has no ingredients and no yield, and the control
 * bar should not render this component; that is the caller's decision, and
 * `recipe-detail.tsx` already computes it as `hasAside`.
 */
export function BatchControl({
  yieldQuantity,
  yieldUnit,
  className,
}: {
  yieldQuantity?: number | null;
  yieldUnit?: string | null;
  className?: string;
}) {
  const { scale, raw, servings, setScale, setRaw, commit, step } = useScale();

  // The settled figures, never `raw`: mid-typing the box holds "0." and an
  // empty string, and neither of those is a readout.
  const multiplier = trim(scale);
  const servingCount = servings == null ? null : trim(scale * servings);
  const yieldNumber =
    yieldQuantity == null
      ? null
      : formatQuantity(scaleAmount(yieldQuantity, scale, yieldUnit));
  const scaledYield = yieldNumber
    ? `${yieldNumber}${yieldUnit ? ` ${yieldUnit}` : ''}`
    : null;

  /*
   * R-ACC-06 through the document's ONE live region, not a second one.
   *
   * `src/lib/announce.ts:5–33` records why there is exactly one: Radix
   * exempts every `aria-live` element AND its whole ancestor chain from
   * `hideOthers`, so a region anywhere inside the shell keeps the header
   * exposed behind the open 360 drawer. `useAnnounce` also treats the first
   * value as a baseline, so arriving on the page announces nothing and only
   * a change a reader made is spoken.
   *
   * A whole statement, because the region has no visible label beside it.
   */
  const announcement =
    servings == null
      ? `Batch ×${multiplier}${scaledYield ? `, makes ${scaledYield}` : ''}`
      : `For ${servingCount} serving${servingCount === '1' ? '' : 's'}${
          scale === 1 ? '' : `, ×${multiplier} batch`
        }`;
  useAnnounce(announcement);

  return (
    <div
      data-batch-control=""
      data-mode={servings == null ? 'batch' : 'servings'}
      className={cn(
        'flex w-full flex-col items-start gap-3',
        'recipe:h-fit recipe:w-fit recipe:shrink-0 recipe:flex-row recipe:items-center recipe:gap-4',
        className,
      )}
    >
      <div className="flex w-full flex-row items-center gap-2 recipe:w-fit recipe:gap-4">
        <span id="scale-label" className={LABEL}>
          {servings == null ? 'Batch' : 'For'}
        </span>

        {servings == null ? (
          /*
           * FORM B — the batch multiplier.
           *
           * The 360 drawing (`recipe-360.html:235–293`) DROPS the field and
           * leaves four presets. This build keeps it: R-SCR-35 makes the
           * text field normative and R-SCR-36 asks for a range of 0.1 to
           * 100, which four presets cannot reach. The field sits on the
           * label row and the presets wrap under it if they ever have to.
           * Flagged to the designer.
           */
          <>
            <label className={FIELD_B_BOX}>
              {/* The design's own glyph, kept out of the value. Decorative:
                  the input's own label says "Batch multiplier". */}
              <span aria-hidden="true" className="text-14 font-mono text-ink">
                ×
              </span>
              <input
                // Text, not number: Chrome reports `value === ''` for a
                // partially-typed number it considers invalid, which desyncs
                // the raw string from what is on screen. `inputMode` still
                // gets the numeric keypad on a phone. R-SCR-35.
                type="text"
                inputMode="decimal"
                value={raw}
                onChange={(event) => setRaw(event.target.value)}
                onBlur={commit}
                aria-label="Batch multiplier"
                className={FIELD_B_INPUT}
              />
            </label>

            <div
              role="group"
              aria-label="Preset batch sizes"
              className="flex flex-1 flex-row flex-wrap items-center gap-1 recipe:h-fit recipe:w-fit recipe:flex-none recipe:flex-nowrap"
            >
              {SCALE_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setScale(preset)}
                  // R-ACC-08. The accessible name is the text `×2`, which
                  // `e2e/` matches with `exact: true` — do not add a label.
                  aria-pressed={scale === preset}
                  className={cn(
                    PRESET,
                    scale === preset ? PRESET_ON : PRESET_OFF,
                  )}
                >
                  ×{preset}
                </button>
              ))}
            </div>
          </>
        ) : (
          /*
           * FORM A — the servings stepper.
           *
           * Drawn once, at 1280, on the foundations plate
           * (`foundations.html:2944–2998`). There is no 360 drawing of it in
           * the eighteen exports, so the narrow form is DERIVED from Form
           * B's 360 treatment — the group grows to fill the row, each cell
           * grows inside it, 9px of block padding, and the two button
           * glyphs take the 11px that Form B's preset labels take. The
           * field keeps 14px: it holds the number, and Form B's field keeps
           * 14px at 360 too. Recorded as a derivation, not a reading, and
           * flagged to the designer.
           */
          <div
            role="group"
            aria-labelledby="scale-label"
            className="flex flex-1 flex-row items-center gap-1 recipe:h-fit recipe:w-fit recipe:flex-none"
          >
            <button
              type="button"
              onClick={() => step(-1)}
              // R-ACC-12. A minus sign alone is not a label, and these two
              // strings are matched verbatim by `e2e/recipe-layout.spec.ts`.
              aria-label="One fewer serving"
              className={STEP_BUTTON}
            >
              −
            </button>
            <input
              type="text"
              inputMode="decimal"
              value={raw}
              onChange={(event) => setRaw(event.target.value)}
              onBlur={commit}
              aria-label="Servings"
              className={FIELD_A}
            />
            <button
              type="button"
              onClick={() => step(1)}
              aria-label="One more serving"
              className={STEP_BUTTON}
            >
              +
            </button>
          </div>
        )}
      </div>

      {/*
       * The readout.
       *
       * Form A: `6 SERVINGS · ×1.5`. The number is part of it — the old
       * build rendered a bare "servings · ×1.5" and the count was missing.
       * Caption A settles the rest: the multiplier shows "only when it is
       * not ×1".
       *
       * Form B: `MAKES 9 KG`, ALWAYS, including at ×1 — the design draws
       * `MAKES 4.5 KG DRIED FROM 10 KG RAW` with ×1 selected
       * (`recipe-1280.html:818` and `:855`), and that readout is Form B's
       * only statement of what one batch is, which is the whole reason Form
       * B exists rather than Form A (Caption B). The old build showed it
       * only when the scale was not 1, and
       * `e2e/shopping-journey.spec.ts:232` asserted that absence; the
       * selector on that line moves to `[data-batch-readout]` in the same
       * commit and the assertion becomes `4.5 kg`.
       *
       * `DRIED FROM 10 KG RAW` is not renderable. `RecipeView.revision`
       * carries `yieldQuantity` and `yieldUnit` and nothing else; the rest
       * comes from the mass-flow figure (R-SCR-39), which the model does
       * not hold.
       */}
      {servings == null
        ? scaledYield && (
            <span data-batch-readout="" className={READOUT}>
              Makes {scaledYield}
            </span>
          )
        : servingCount && (
            <span data-batch-readout="" className={READOUT}>
              {servingCount} serving{servingCount === '1' ? '' : 's'}
              {scale === 1 ? '' : ` · ×${multiplier}`}
            </span>
          )}
    </div>
  );
}
