'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { formatQuantity } from '@/lib/domain/units';
import { scaleAmount, useScale } from './scale';
import { CATEGORY_LABELS, categoryRank } from '@/lib/site';
import type { IngredientLineView } from '@/lib/queries/read';

/**
 * A recipe's ingredients as a tickable list.
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
 * It is deliberately not persisted: the scale you used last week is not a
 * safe default for a recipe you are reading today, and the recipe's own
 * quantities are what the page should say when you arrive.
 */

function storageKey(slug: string, revisionNumber: number): string {
  return `nn:checked:${slug}:${revisionNumber}`;
}

/** The scales worth a button. Anything else goes in the box beside them. */
const SCALE_PRESETS = [0.5, 1, 2, 3];

function Amount({ line, scale }: { line: IngredientLineView; scale: number }) {
  const amount = formatQuantity(
    line.quantity == null ? line.quantity : scaleAmount(line.quantity, scale),
    line.quantityMax == null
      ? line.quantityMax
      : scaleAmount(line.quantityMax, scale),
  );
  if (!amount) return <span className="amount" />;
  return (
    <span className="amount">
      {amount}
      {line.unit ? ` ${line.unit}` : ''}
    </span>
  );
}

export function IngredientChecklist({
  slug,
  revisionNumber,
  lines,
  yieldQuantity,
  yieldUnit,
}: {
  slug: string;
  revisionNumber: number;
  lines: IngredientLineView[];
  yieldQuantity?: number | null;
  yieldUnit?: string | null;
}) {
  const [byShop, setByShop] = useState(true);
  // Shared, not local: the yield in "At a glance" reads the same value, so
  // the page cannot state two batch sizes at once.
  const { scale, raw, setScale, setRaw, commit } = useScale();
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);

  // Read after mount, never during render: the server has no localStorage,
  // and seeding state from it directly would mismatch the hydrated markup.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey(slug, revisionNumber));
      if (raw) setChecked(new Set(JSON.parse(raw) as string[]));
    } catch {
      // Private mode, blocked storage, corrupt JSON — an unticked list is a
      // perfectly good fallback, so there is nothing to report.
    }
    setReady(true);
  }, [slug, revisionNumber]);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(
        storageKey(slug, revisionNumber),
        JSON.stringify([...checked]),
      );
    } catch {
      // Ticking still works for this visit; it just will not survive a
      // reload. Not worth interrupting the cook over.
    }
  }, [checked, ready, slug, revisionNumber]);

  function toggle(id: string) {
    setChecked((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const groups = useMemo(() => {
    if (!byShop) {
      // Written order, preserving the recipe's own components.
      const map = new Map<string, IngredientLineView[]>();
      for (const line of lines) {
        const key = line.component ?? '';
        const list = map.get(key) ?? [];
        list.push(line);
        map.set(key, list);
      }
      return [...map.entries()].map(([key, items]) => ({
        key: key || 'main',
        label: key,
        items,
      }));
    }

    const map = new Map<string, IngredientLineView[]>();
    for (const line of lines) {
      const key = line.ingredient?.category ?? 'other';
      const list = map.get(key) ?? [];
      list.push(line);
      map.set(key, list);
    }
    return [...map.entries()]
      .sort(
        ([a], [b]) => categoryRank(a) - categoryRank(b) || a.localeCompare(b),
      )
      .map(([key, items]) => ({
        key,
        label: CATEGORY_LABELS[key] ?? key,
        items: [...items].sort((a, b) =>
          (a.ingredient?.name ?? a.rawText).localeCompare(
            b.ingredient?.name ?? b.rawText,
          ),
        ),
      }));
  }, [lines, byShop]);

  const done = lines.filter((line) => checked.has(line.id)).length;

  return (
    <>
      <div className="checklist-head">
        <div className="checklist-toggle" role="group" aria-label="Order">
          <button
            type="button"
            onClick={() => setByShop(true)}
            aria-pressed={byShop}
          >
            Shop order
          </button>
          <button
            type="button"
            onClick={() => setByShop(false)}
            aria-pressed={!byShop}
          >
            As written
          </button>
        </div>
        <span className="faint" aria-live="polite">
          {done} / {lines.length}
        </span>
      </div>

      <div className="scale-bar">
        <span className="scale-label" id="scale-label">
          Batch
        </span>
        <div
          className="checklist-toggle"
          role="group"
          aria-labelledby="scale-label"
        >
          {SCALE_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setScale(preset)}
              aria-pressed={scale === preset}
            >
              ×{preset}
            </button>
          ))}
        </div>
        <label className="scale-custom">
          <span className="visually-hidden">Custom multiplier</span>
          <input
            // Text, not number: Chrome reports `value === ''` for a
            // partially-typed number it considers invalid, which desyncs
            // the raw string from what is on screen. `inputMode` still
            // gets the numeric keypad on a phone.
            type="text"
            inputMode="decimal"
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
            onBlur={commit}
            aria-label="Batch multiplier"
          />
        </label>
        {scale !== 1 && yieldQuantity != null ? (
          // "At a glance" carries the scaled yield too. This stays because
          // the table is above the fold on desktop and off it on a phone,
          // and the number belongs next to the control that changed it.
          <span className="faint scale-yield">
            makes {formatQuantity(scaleAmount(yieldQuantity, scale))}
            {yieldUnit ? ` ${yieldUnit}` : ''}
          </span>
        ) : null}
      </div>

      {groups.map((group) => (
        <div className="ingredient-group" key={group.key}>
          {group.label ? <h4>{group.label}</h4> : null}
          <ul className="ingredient-list checklist">
            {group.items.map((line) => {
              const label = line.ingredient?.name ?? line.rawText;
              const isChecked = checked.has(line.id);
              return (
                <li key={line.id} data-checked={isChecked || undefined}>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggle(line.id)}
                      aria-label={label}
                    />
                  </label>
                  <Amount line={line} scale={scale} />
                  <span className="what">
                    {line.ingredient ? (
                      <Link href={`/ingredients/${line.ingredient.slug}`}>
                        {label}
                      </Link>
                    ) : (
                      label
                    )}
                    {line.preparation ? (
                      <span className="prep">, {line.preparation}</span>
                    ) : null}
                    {line.optional ? (
                      <span className="faint"> (optional)</span>
                    ) : null}
                    {line.note ? (
                      <div className="faint checklist-note">{line.note}</div>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {done > 0 ? (
        <button
          type="button"
          className="button-secondary"
          onClick={() => setChecked(new Set())}
        >
          Clear ticks
        </button>
      ) : null}
    </>
  );
}
