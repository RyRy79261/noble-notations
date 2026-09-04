'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { FilterableGroups } from '@/components/filterable-groups';
import { CATEGORY_LABELS } from '@/lib/site';

/**
 * The combined shopping list, as something you can actually shop from.
 *
 * A list you cannot tick is a list you lose your place in. These ticks mean
 * "in the trolley", which is a different question from the per-recipe
 * checklist's "I have this in the cupboard", so they are stored separately
 * and keyed by the set of recipes the list was built from. Change the
 * recipes and you get a fresh list rather than ticks inherited from a shop
 * you already did.
 *
 * Tick-all is here because the common case is a big list with two things
 * missing: ticking forty rows to find them is worse than ticking one box
 * and unticking two.
 */

export interface ShoppingEntry {
  key: string;
  slug: string | null;
  name: string;
  category: string;
  amounts: string[];
  unquantified: boolean;
  optional: boolean;
  from: { slug: string; title: string; text: string }[];
}

export interface ShoppingGroup {
  category: string;
  entries: ShoppingEntry[];
}

function storageKey(selection: string[]): string {
  return `nn:shopping:${[...selection].sort().join(',')}`;
}

export function ShoppingChecklist({
  groups,
  selection,
}: {
  groups: ShoppingGroup[];
  selection: string[];
}) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);
  const key = storageKey(selection);

  // Read after mount, never during render: the server has no localStorage,
  // and seeding from it would mismatch the hydrated markup.
  useEffect(() => {
    let restored = new Set<string>();
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) restored = new Set(JSON.parse(raw) as string[]);
    } catch {
      // Blocked storage or corrupt JSON. An unticked list is a fine list.
    }
    setChecked(restored);
    setReady(true);
  }, [key]);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(key, JSON.stringify([...checked]));
    } catch {
      // Ticking still works for this visit, it just will not survive a
      // reload. Not worth interrupting a shop over.
    }
  }, [checked, ready, key]);

  const allKeys = useMemo(
    () => groups.flatMap((group) => group.entries.map((entry) => entry.key)),
    [groups],
  );
  const done = allKeys.filter((entryKey) => checked.has(entryKey)).length;
  const allDone = allKeys.length > 0 && done === allKeys.length;

  function toggle(entryKey: string) {
    setChecked((previous) => {
      const next = new Set(previous);
      if (next.has(entryKey)) next.delete(entryKey);
      else next.add(entryKey);
      return next;
    });
  }

  const filterGroups = groups.map((group) => ({
    key: group.category,
    heading: (
      <h2 className="shopping-group-heading">
        {CATEGORY_LABELS[group.category] ?? group.category}{' '}
        <span className="faint">{group.entries.length}</span>
      </h2>
    ),
    items: group.entries.map((entry) => ({
      key: entry.key,
      // Everything worth searching, including the recipes that put it here
      // and its shop area — neither is fully visible on the row itself.
      text: [
        entry.name,
        entry.category,
        CATEGORY_LABELS[entry.category] ?? '',
        ...entry.from.map((from) => from.title),
      ].join(' '),
      node: (
        <li
          key={entry.key}
          className="shopping-item"
          data-checked={checked.has(entry.key) || undefined}
        >
          <label className="check">
            <input
              type="checkbox"
              checked={checked.has(entry.key)}
              onChange={() => toggle(entry.key)}
              aria-label={entry.name}
            />
          </label>
          <div className="shopping-amount">
            {entry.amounts.length > 0 ? entry.amounts.join(' + ') : null}
            {entry.unquantified ? (
              <span className="faint">
                {entry.amounts.length > 0 ? ' + some' : 'some'}
              </span>
            ) : null}
          </div>
          <div className="shopping-what">
            {entry.slug ? (
              <Link href={`/ingredients/${entry.slug}`}>{entry.name}</Link>
            ) : (
              <span>{entry.name}</span>
            )}
            {entry.optional ? <span className="badge">optional</span> : null}
            <div className="faint shopping-from">
              {entry.from.map((from, index) => (
                <span key={`${from.slug}-${index}`}>
                  {index > 0 ? ' · ' : ''}
                  <Link href={`/recipes/${from.slug}`}>{from.title}</Link>{' '}
                  <span title={from.text}>({from.text})</span>
                </span>
              ))}
            </div>
          </div>
        </li>
      ),
    })),
    layout: 'list' as const,
    listClassName: 'shopping-list',
  }));

  return (
    <>
      <div className="checklist-head">
        <label className="check-all">
          <input
            type="checkbox"
            checked={allDone}
            // Part-way through is neither ticked nor unticked, and saying so
            // is what stops the box reading as "nothing is ticked".
            ref={(node) => {
              if (node) node.indeterminate = done > 0 && !allDone;
            }}
            onChange={() => setChecked(allDone ? new Set() : new Set(allKeys))}
          />
          <span>{allDone ? 'Untick all' : 'Tick all'}</span>
        </label>
        <span className="faint" aria-live="polite">
          {done} / {allKeys.length} in the trolley
        </span>
      </div>

      <FilterableGroups
        groups={filterGroups}
        label="Filter the shopping list"
        placeholder="Filter by ingredient, shop area or recipe…"
        countNoun="ingredient"
      />
    </>
  );
}
