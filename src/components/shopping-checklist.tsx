'use client';

import { useEffect, useMemo, useState } from 'react';

import { ListRow, TickAll, type TickAllState } from '@/components/f/list-row';
import { SectionHead } from '@/components/f/section-label';
import { FilterableGroups } from '@/components/filterable-groups';
import { useAnnounce } from '@/lib/announce';
import { cardinal, CATEGORY_LABELS, roman } from '@/lib/site';

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
 * ─── WHAT THE DESIGN DRAWS ───────────────────────────────────────────────
 *
 * `list-search-archive-1280.html:488` and `m360-batch-search-list.html:5692`.
 * Under the notice: one `f-desk` bar carrying the tick-all control and its
 * readout, then the aisles — a `gap-[ 32px ]` column at 1280 and
 * `gap-[ 28px ]` at 360, each aisle an `F/Section label` over a `gap-0`
 * column of `F/List row`. Every part of that is M4's and is imported here;
 * this file decides what is ticked and nothing about how a row is drawn.
 *
 * R-CMP-12 is `TickAll`'s three states, and the middle one is real: some
 * ticked and some not is `aria-checked="mixed"` on a `role="checkbox"`
 * button. It is a button and not an `<input>` because `indeterminate` is a
 * DOM property with no attribute — React cannot set it declaratively — and
 * the drawn control is a chip rather than a box anyway.
 *
 * ─── THE FILTER THE DESIGN DOES NOT DRAW ─────────────────────────────────
 *
 * `/list` is the one screen in the M6 set that carries a filter the design
 * has no bar for: neither the 1280 frame nor the 360 frame draws one, and
 * §10.6 does not ask for one. `e2e/filtering.spec.ts:70` does — "the
 * shopping list is filterable too" — and a 27-row list across five aisles
 * is exactly the length the filter exists for. So it stays, drawn as
 * `F/Filter` like every other one rather than as something of its own, and
 * the conflict is recorded for the designer: either the design gains the bar
 * it already draws on `/ingredients` and `/cuisines`, or that test goes.
 *
 * `FilterableGroups` also fixes the column gap at 44px and the group gap at
 * 16px, where this screen draws 32 and 8. That is the cost of not forking
 * it, and it is the right trade: the matching, the announcement and the
 * empty state are one implementation across four screens.
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

/**
 * `"101.9 g"` → `101.9` and `g`; `"2"` → `2` and nothing.
 *
 * `formatAggregate` writes an amount as a value, a space and the unit as it
 * was written, or as a bare value when the line carried no unit. The design
 * draws those two parts in two columns — a 52px right-aligned mono figure
 * and a 43px quiet unit — so they are split here rather than in the row,
 * which takes them already apart.
 */
function splitAmount(amount: string): { value: string; unit?: string } {
  const space = amount.indexOf(' ');
  if (space === -1) return { value: amount };
  return { value: amount.slice(0, space), unit: amount.slice(space + 1) };
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
  //
  // R-STO-03: two tabs on the same list stay in step. This is the key most
  // likely to be open twice — a phone in the shop and a laptop at home — and
  // it was the one of the three that had no `storage` listener. The event
  // only fires in the OTHER tabs, so it cannot loop with the write below,
  // and it is guarded on the key so a write from a different selection of
  // recipes does not clear this list's ticks. R-STO-01's try/catch covers
  // the re-read as well.
  useEffect(() => {
    const restore = () => {
      let restored = new Set<string>();
      try {
        const raw = window.localStorage.getItem(key);
        if (raw) restored = new Set(JSON.parse(raw) as string[]);
      } catch {
        // Blocked storage or corrupt JSON. An unticked list is a fine list.
      }
      setChecked(restored);
      setReady(true);
    };

    restore();

    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== key) return;
      restore();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
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
  // `ready` is the hydration flag: the ticks restored from storage on
  // arrival are the baseline, not an announcement.
  useAnnounce(`${done} of ${allKeys.length} in the trolley`, ready);

  const state: TickAllState =
    allKeys.length > 0 && done === allKeys.length
      ? 'all'
      : done > 0
        ? 'some'
        : 'none';

  function toggle(entryKey: string) {
    setChecked((previous) => {
      const next = new Set(previous);
      if (next.has(entryKey)) next.delete(entryKey);
      else next.add(entryKey);
      return next;
    });
  }

  const filterGroups = groups.map((group, index) => ({
    key: group.category,
    heading: (
      <SectionHead
        /* `data-shopping-group` is a test hook, not a style:
           `e2e/shopping-journey.spec.ts` reads these to check the shop order
           and measures one against the row above it. It replaced the
           `shopping-group-heading` class at M7, when `globals.css` went and
           the class stopped meaning anything. */
        data-shopping-group=""
        ordinal={roman(index + 1)}
        title={CATEGORY_LABELS[group.category] ?? group.category}
        meta={`${cardinal(group.entries.length)} ingredient${
          group.entries.length === 1 ? '' : 's'
        }`}
      />
    ),
    items: group.entries.map((entry) => {
      const [first, ...rest] = entry.amounts;
      const main = first ? splitAmount(first) : undefined;
      /* R-SCR-19's kept-apart line: everything that would not convert into
         the first bucket, plus the "some" that stands for a line nobody
         gave a quantity. The design draws it as `+ 10 heads` under
         `2 cloves`, right-aligned across the whole amount column. */
      const extras = [
        ...rest,
        ...(entry.unquantified && first ? ['some'] : []),
      ];

      return {
        key: entry.key,
        // Everything worth searching, including the recipes that put it here
        // and its shop area — neither is fully visible on the row itself.
        text: [
          entry.name,
          entry.category,
          CATEGORY_LABELS[entry.category] ?? '',
          ...entry.from.map((from) => from.title),
        ].join(' '),
        node:
          (
            /*
             * `data-shopping-item` is a test hook, not a style:
             * `e2e/list.spec.ts`, `e2e/filtering.spec.ts`,
             * `e2e/recipe-checklist.spec.ts` and
             * `e2e/shopping-journey.spec.ts` all count these. It replaced the
             * `shopping-item` class at M7. The four resets that stood beside
             * that class — a margin, a gap, a padding and a zeroed border —
             * existed only to cancel the three-column grid `globals.css` drew
             * on it, and went with the rule they cancelled. F/List row draws
             * the row inside.
             */
            <li
              key={entry.key}
              data-shopping-item=""
              className="flex w-full flex-col"
            >
              <ListRow
                amount={main?.value}
                unit={main?.unit}
                extra={
                  extras.length > 0
                    ? extras.map((e) => `+ ${e}`).join(' ')
                    : undefined
                }
                name={entry.name}
                href={entry.slug ? `/ingredients/${entry.slug}` : undefined}
                /* R-SCR-21: every recipe that put this on the list, linked,
                 and the words it actually asked for underneath. */
                sources={entry.from.map((from) => ({
                  name: from.title,
                  href: `/recipes/${from.slug}`,
                }))}
                originals={entry.from.map((from) => from.text)}
                ticked={checked.has(entry.key)}
                onTick={() => toggle(entry.key)}
                label={entry.name}
                /* §10.6 names this badge and the design draws none, because
                   no row on any `/list` frame is optional. `F/List row`'s
                   own note records the resolution. */
                optional={entry.optional}
              />
            </li>
          ),
      };
    }),
    layout: 'list' as const,
  }));

  return (
    <>
      <TickAll
        /* `data-checklist-head` is a test hook, not a style:
           `e2e/shopping-journey.spec.ts` reads the readout through it. It
           replaced the `checklist-head` class at M7, and the `mb-0` beside
           that class — which cancelled the old rule's bottom margin — went
           with it. */
        data-checklist-head=""
        state={state}
        label={state === 'all' ? 'Untick everything' : 'Tick everything'}
        // Announced through the document's one live region as well — see
        // `useAnnounce` above and the note in `filterable-groups.tsx`.
        readout={`${done} of ${allKeys.length} in the trolley`}
        onToggle={() =>
          setChecked(state === 'all' ? new Set() : new Set(allKeys))
        }
      />

      <FilterableGroups
        groups={filterGroups}
        label="Filter the shopping list"
        placeholder="Filter by ingredient, shop area or recipe"
        countNoun="ingredient"
      />
    </>
  );
}
