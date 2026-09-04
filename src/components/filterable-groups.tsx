'use client';

import { useMemo, useState, type ReactNode } from 'react';

/**
 * A filter box over any view that renders items inside groups.
 *
 * Several pages share the same shape — ingredients under categories, terms
 * under facets, a shopping list under aisles, a method under phases — and
 * all of them get long enough that scanning beats scrolling. Rather than
 * each page growing its own filter, they hand their already-rendered
 * markup here.
 *
 * The server renders every heading and row as a React node and passes them
 * in as props; this component only decides what to show. That keeps the
 * markup, links and data fetching on the server where they belong, and
 * limits the client bundle to the matching logic. React Server Components
 * make that possible — a Server Component may pass JSX to a Client
 * Component, it just cannot pass a function.
 *
 * Matching is a case-insensitive substring over `text`, which the caller
 * supplies alongside each node. Callers should put everything worth
 * searching in it (a name, its aliases, its category) even where the
 * rendered row does not show all of it.
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
    return (
      <div className="table-scroll">
        <table>
          {group.tableHead}
          <tbody>{nodes}</tbody>
        </table>
      </div>
    );
  }

  if (group.layout === 'list') {
    return <ul className={group.listClassName ?? 'plain-list'}>{nodes}</ul>;
  }

  return <div className="row">{nodes}</div>;
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

  return (
    <>
      <div className="filter-bar">
        <label className="field">
          <span className="visually-hidden">{label}</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={placeholder}
            // Announced politely as the count changes, so a screen-reader
            // user is not left guessing whether anything matched.
            aria-describedby="filter-count"
          />
        </label>
        <p id="filter-count" className="faint" aria-live="polite">
          {needle
            ? `${shown} of ${total} ${countNoun}${total === 1 ? '' : 's'}`
            : `${total} ${countNoun}${total === 1 ? '' : 's'}`}
        </p>
      </div>

      {visible.length === 0 ? (
        <p className="empty">Nothing matches “{query.trim()}”.</p>
      ) : (
        visible.map((group) => (
          <section className="section" key={group.key}>
            {group.heading}
            {group.intro}
            <GroupBody group={group} />
          </section>
        ))
      )}
    </>
  );
}
