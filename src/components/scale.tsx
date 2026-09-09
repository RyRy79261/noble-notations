'use client';

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { formatQuantity, unitKind } from '@/lib/domain/units';

/**
 * The batch multiplier, shared by everything on a recipe page that shows a
 * quantity.
 *
 * It used to be `useState` inside the ingredient checklist, which meant
 * nothing else could see it — and a value nobody else can see produces
 * numbers that contradict each other on the same screen. At ×3 the "At a
 * glance" table said "Yield 4.5 kg dried" while the readout beside the
 * scaler said "makes 13.5 kg". At ×999 it was 4.5 kg against 4496 kg.
 * Neither figure was wrong on its own; the page simply had two answers to
 * one question.
 *
 * A client provider wrapping server-rendered children: the recipe body
 * stays a server component and still reads the context, because context
 * flows through the rendered tree rather than the module graph.
 */

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
        // would jump to five batches.
        const current = scale * basis;
        const grid = basis > 1 ? 1 : 0.5;
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
      {scale !== 1 ? (
        <span className="faint scale-marker"> ×{scale} batch</span>
      ) : null}
    </>
  );
}
