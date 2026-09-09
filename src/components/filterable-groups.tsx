'use client';

import { useMemo, useState, type ReactNode } from 'react';

import { Filter } from '@/components/f/field';
import { Empty } from '@/components/f/notice';
import { useAnnounce } from '@/lib/announce';
import { cn } from '@/lib/utils';

/**
 * C-17 — a filter box over any view that renders items inside groups.
 *
 * Several pages share the same shape — ingredients under aisles, terms
 * under facets, a shopping list under shop areas, a method under phases —
 * and all of them get long enough that scanning beats scrolling. Rather
 * than each page growing its own filter, they hand their already-rendered
 * markup here.
 *
 * ─── R-CON-02: A FUNCTION CANNOT CROSS THIS BOUNDARY ─────────────────────
 *
 * The server renders every heading and row as a React node and passes them
 * in as props; this component only decides what to show. That keeps the
 * markup, links and data fetching on the server where they belong, and
 * limits the client bundle to the matching logic. React Server Components
 * make that possible — a Server Component may pass JSX to a Client
 * Component, it just cannot pass a function.
 *
 * That is why `layout` is a NAME and `tableHead` is a NODE. A render
 * callback would read better and would not serialise: the caller is a
 * Server Component, and the wrapper has to be chosen here because only here
 * is it known which items survived the query. Do not "improve" either one
 * into a callback.
 *
 * Matching is a case-insensitive substring over `text`, which the caller
 * supplies alongside each node. Callers should put everything worth
 * searching in it (a name, its aliases, its category) even where the
 * rendered row does not show all of it.
 *
 * ─── What the design draws ───────────────────────────────────────────────
 *
 * The bar is `F/Filter`, drawn identically on `/ingredients`
 * (`ingredients-1280.html:315`) and `/cuisines`
 * (`classes-cuisines-1280.html:3237`): one full-width `f-desk` bar,
 * `p-[ 11px_13px ]`, a 10px mono placeholder that grows, and a 10px mono
 * count at the right edge. `src/components/f/field.tsx` carries it, focus
 * ring and boundary included, and this file spends it rather than drawing
 * a second one.
 *
 * The column that holds the bar and the groups is the design's `Main`,
 * `flex flex-col gap-[ 44px ]` on both index screens — so `gap-11`. A group
 * is the design's `Aisle`, `flex flex-col gap-[ 16px ]` (`gap-4`), heading
 * then rows, and `Rows` inside it is `gap-0`: the rows are separated by
 * their own padding and their own hairline, never by a gap.
 *
 * R-STA-04 is `F/Empty`, which already writes the sentence, curly quotes
 * and all. R-ACC-06 is the count, below.
 *
 * `"use client"` is required and is one of the eight in §9.3: this is the
 * component that has to react to what a reader types.
 */
export interface FilterableItem {
  key: string;
  /** Lowercased and matched against the query. */
  text: string;
  node: ReactNode;
}

export interface FilterableGroup {
  key: string;
  heading: ReactNode;
  /** Shown under the heading, above the items. */
  intro?: ReactNode;
  items: FilterableItem[];
  /**
   * How the surviving items are wrapped. A Server Component may pass JSX
   * across this boundary but *not* a function, so the caller names a shape
   * rather than supplying a render callback — the client owns the wrapper
   * markup because only the client knows which items survived.
   */
  layout?: 'row' | 'list' | 'table';
  /** The <thead> for `layout: 'table'`. Columns differ per page. */
  tableHead?: ReactNode;
  /** Class applied to the list wrapper for `layout: 'list'`. */
  listClassName?: string;
}

function GroupBody({ group }: { group: FilterableGroup }) {
  const nodes = group.items.map((item) => item.node);

  if (group.layout === 'table') {
    /* R-STA-08: a table that cannot fit scrolls inside its own box, and
       R-STA-09: the page body never scrolls sideways. The old wrapper also
       drew a border and a radius; the design draws neither — a table in
       this system is four hairlines under four rows and nothing around the
       outside (`F/Table row`, `foundations.html:3369`). The rows themselves
       are still the page's own `<tr>`s and are M6's to rebuild. */
    return (
      <div className="w-full overflow-x-auto">
        <table className="w-full">
          {group.tableHead}
          <tbody>{nodes}</tbody>
        </table>
      </div>
    );
  }

  if (group.layout === 'list') {
    /* `list-none m-0 p-0` are not decoration: Tailwind's preflight is off
       until M7, so a bare `<ul>` still carries the user agent's marker and
       indent. `gap-0` is the design's `Rows`. */
    return (
      <ul
        className={cn(
          'm-0 flex w-full list-none flex-col gap-0 p-0',
          group.listClassName ?? 'plain-list',
        )}
      >
        {nodes}
      </ul>
    );
  }

  /* `row` is `/classes` and nothing else today, and the design draws that
     row at 8px: `classes-cuisines-1280.html:384`, `Tags`, `flex flex-row
     gap-[ 8px ] items-center`. The 16px this used to carry is F/Recipe card's
     `Tags` row, a different container on a different screen. The pill ground
     and its 8px accent square on that same screen are M6's. */
  return (
    <div className="flex w-full flex-row flex-wrap items-center gap-2">
      {nodes}
    </div>
  );
}

export function FilterableGroups({
  groups,
  label = 'Filter',
  placeholder = 'Type to filter…',
  countNoun = 'item',
}: {
  groups: FilterableGroup[];
  label?: string;
  placeholder?: string;
  countNoun?: string;
}) {
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();

  const visible = useMemo(() => {
    if (!needle) return groups;
    return (
      groups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) =>
            item.text.toLowerCase().includes(needle),
          ),
        }))
        // An empty group is noise once filtering starts — the point is to get
        // the answer on one screen.
        .filter((group) => group.items.length > 0)
    );
  }, [groups, needle]);

  const shown = visible.reduce((sum, group) => sum + group.items.length, 0);
  const total = groups.reduce((sum, group) => sum + group.items.length, 0);
  const countText = needle
    ? `${shown} of ${total} ${countNoun}${total === 1 ? '' : 's'}`
    : `${total} ${countNoun}${total === 1 ? '' : 's'}`;
  useAnnounce(countText);

  return (
    <div className="flex w-full flex-col items-start gap-11">
      <Filter
        placeholder={placeholder}
        /* The design draws no label beside the bar, so the placeholder is
           the visible one and this is the accessible name. The pages pass a
           fuller sentence than the placeholder ("Filter ingredients"), and
           the fuller one wins. */
        aria-label={label}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        // Announced politely as the count changes, so a screen-reader
        // user is not left guessing whether anything matched.
        aria-describedby="filter-count"
        count={<span id="filter-count">{countText}</span>}
      />

      {/* R-ACC-06. The count is described text, not a live region of its
          own: a region inside `<main>` keeps the whole shell in the
          accessibility tree behind the open 360 drawer, because Radix's
          `hideOthers` exempts one and every ancestor of it. The change is
          announced through the document's single region instead — see
          `src/lib/announce.ts`, and `useAnnounce` above. */}

      {visible.length === 0 ? (
        <Empty query={query.trim()} />
      ) : (
        visible.map((group) => (
          /* `section` is a SELECTOR and `mt-0` cancels the one declaration
             globals.css hangs on it. `e2e/filtering.spec.ts` scopes its
             "the hidden group is really gone" assertion to
             `section.section`, and `globals.css` keys the shopping list's
             first heading off it. Both go with globals.css at M7. */
          <section
            className={cn(
              'section',
              'mt-0 flex w-full flex-col items-start gap-4',
            )}
            key={group.key}
          >
            {group.heading}
            {group.intro}
            <GroupBody group={group} />
          </section>
        ))
      )}
    </div>
  );
}
