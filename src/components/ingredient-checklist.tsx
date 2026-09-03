'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { formatQuantity } from '@/lib/domain/units';
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
 */
function storageKey(slug: string, revisionNumber: number): string {
  return `nn:checked:${slug}:${revisionNumber}`;
}

function Amount({ line }: { line: IngredientLineView }) {
  const amount = formatQuantity(line.quantity, line.quantityMax);
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
}: {
  slug: string;
  revisionNumber: number;
  lines: IngredientLineView[];
}) {
  const [byShop, setByShop] = useState(true);
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
                  <Amount line={line} />
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
