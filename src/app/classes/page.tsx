import type { Metadata } from 'next';

import { Breadcrumb } from '@/components/f/breadcrumb';
import { Mark, MarkQuiet } from '@/components/f/mark';
import { Empty } from '@/components/f/notice';
import { PageHead, PageHero } from '@/components/f/page-head';
import { SectionHead } from '@/components/f/section-label';
import { Stat } from '@/components/f/stat';
import { DatabaseNotice } from '@/components/database-notice';
import { FilterableGroups } from '@/components/filterable-groups';
import { TermTag } from '@/components/tags';
import { listCategories, type TermWithCount } from '@/lib/queries/read';
import { safeRead } from '@/lib/safe';
import { CATEGORY_TYPE_LABELS, cardinal, roman } from '@/lib/site';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Classification',
  description:
    'The full classification scheme: cuisine, course, technique, diet, season, equipment, occasion, preservation, texture and ingredient class.',
  alternates: { canonical: '/classes' },
};

/*
 * ─── WHAT THE DESIGN DRAWS ───────────────────────────────────────────────
 *
 * `design/exports/png/u8IoWj.png` and `classes-cuisines-1280.html:203`.
 * `/classes` is a DOCUMENT, not a grid of cards. There is no box, no fill,
 * no radius and no card anywhere on it:
 *
 *   Page head    NN · CLASSIFICATION            TEN TYPES · FIFTY TAGS
 *   Breadcrumb   CATALOGUE · CLASSIFICATION
 *   Hero row     the 48px title beside a 200px column of three statistics
 *   Section      I  Types of tag  ·  TEN · ONE NOT YET POPULATED
 *   Type list    ten hairline-ruled rows, `gap-0`
 *
 * A row is the design's `Type list > Cuisine`, `:347`. Three columns, 24px
 * apart, on a 1px `f-hair` TOP rule with `p-[ 20px_0_22px_0 ]`:
 *
 *   Num     w-[ 28px ]   10px mono `f-ink-3` at 0.5px
 *   Left    w-[ 236px ]  21/24 Newsreader 500, then `SIX TAGS` in 9px mono
 *   Right   flex:1 1 0   14/24 Geist, then the tag pills 16px below
 *
 * At 360 (`m360-classes-ingredients.html:492`, `png/Wx0lE.png`) the row
 * rotates into a column: the number, the name and the count share one line,
 * the description takes the next, and the pills wrap under it. The rule
 * moves to the bottom and quietens to `f-hair-2`, and the type steps down —
 * 21px to 17px, 14/24 to 13/22.
 *
 * ─── THE FILTER THE DESIGN DOES NOT DRAW ─────────────────────────────────
 *
 * R-SCR-24 requires it: "the filter MUST match the term explanation. The
 * word 'numbing' must find Sichuan." Neither the 1280 frame nor the 360 one
 * draws a filter bar on this screen — `/cuisines` and `/ingredients` both do
 * — so the requirement outranks the drawing here and the bar ships. It sits
 * under the numbered section head rather than above it, because C-17 owns
 * the bar and the groups together and renders them in that order.
 *
 * ─── HOW THE DRAWN ROW SURVIVES C-17'S WRAPPERS ──────────────────────────
 *
 * `FilterableGroups` draws a fixed column: a `gap-11` outer, then one
 * `gap-4` section per group holding `heading`, `intro` and the items. The
 * page cannot style either wrapper, so the drawn row is split across them:
 *
 *   heading   the whole three-column row EXCEPT the pills
 *   items     the pills, one `<li>` each, in `layout: 'list'`
 *
 * The section's own `gap-4` is then the design's 16px between the
 * description and the pill row, and `listClassName` carries the 312px
 * indent that puts the pills under the description at `shell:` —
 * 28 + 24 + 236 + 24, the three columns and their two gaps.
 *
 * THE TWO NEGATIVE MARGINS ARE THE ONE PLACE THIS FIGHTS THE WRAPPER, and
 * they are measured rather than nudged. C-17 puts 44px between groups; the
 * design puts the rule 22px below the previous row's pills at 1280 (its
 * `pb-22`) and 18px below them at 360 (`pb-18`). `-mt-5.5` and `-mt-6.5`
 * are exactly 44 − 22 and 44 − 18. `-mb-1` is the same arithmetic on the
 * other axis: the design's row gap is 12px at 360 and the section's is 16.
 * If C-17's `gap-11` ever changes, these three change with it.
 */

/**
 * One line of plain English for each kind of tag.
 *
 * The design writes all ten (`classes-cuisines-1280.html:378` and the nine
 * rows after it) and they are better than the ones this screen carried:
 * "Where a dish comes from. One only, and it never changes once set."
 * against "The cooking tradition of the dish." D-07 set the precedent —
 * drawn copy replaces inherited copy — and D-04 put the rename in the page
 * copy for the same reason.
 *
 * Two words are corrected. The design writes "an recipe" and "a
 * ingredient" throughout; the repository writes "a recipe". The article is
 * a typo in the design file, not a voice.
 */
const CATEGORY_TYPE_BLURBS: Record<string, string> = {
  cuisine: 'Where a dish comes from. One only, and it never changes once set.',
  course:
    'Where the dish sits in a meal — what you would put it next to on the table.',
  technique:
    'What the cook actually does to the food, named by the action rather than the outcome.',
  diet: 'Who can eat it as written, without substituting anything out.',
  season:
    'When the ingredients are at their best, or when the weather makes the method work.',
  equipment: 'What you must already own before the first step makes sense.',
  occasion:
    'Why you would make it — the reason that gets it onto the stove at all.',
  preservation:
    'How the keeping time is extended beyond what the raw ingredient allows.',
  texture: 'How it feels to eat, once it is finished and served.',
  ingredient_class:
    'What an ingredient is in kind, so that like can be swapped for like.',
};

/** `SIX TAGS`, `ONE TAG`, `NO TAGS`. The design writes the count as a word. */
function tagCount(count: number): string {
  if (count === 0) return 'no tags';
  return `${cardinal(count)} ${count === 1 ? 'tag' : 'tags'}`;
}

/** The design's `Type list > Cuisine`, less its pills. See the note above. */
function TypeRow({
  ordinal,
  label,
  blurb,
  count,
}: {
  ordinal: string;
  label: string;
  blurb: string | undefined;
  count: number;
}) {
  return (
    <div
      className={cn(
        '-mt-6.5 -mb-1 flex h-fit w-full shrink-0 flex-row flex-wrap items-start gap-3 pt-4',
        '[border-style:solid] [border-width:1px_0px_0px_0px] border-t-hair-2',
        'shell:-mt-5.5 shell:mb-0 shell:flex-nowrap shell:items-start shell:gap-6 shell:border-t-hair shell:pt-5',
      )}
    >
      {/* 22px at 360, 28px at 1280. `tabular-nums` so `01` and `10` line
          up down the left margin (R-CON-06). */}
      <span
        className={cn(
          'w-5.5 shrink-0 text-10 leading-normal font-mono tabular-nums text-ink-3',
          'shell:w-7 shell:tracking-micro',
        )}
      >
        {ordinal}
      </span>{' '}
      {/* R-CMP-14's real space. A flex gap is invisible to `textContent`, so
          without it the row reads "01Cuisine" to a screen reader and to a
          copy-paste. A whitespace-only run is not a flex item, so nothing
          drawn moves. */}
      <div
        className={cn(
          'flex min-w-0 flex-1 flex-row items-center gap-3',
          'shell:w-59 shell:flex-none shell:flex-col shell:items-start shell:gap-2',
        )}
      >
        <h3
          className={cn(
            'm-0 text-17 leading-normal font-serif font-medium tracking-flat text-ink',
            'shell:text-21 shell:leading-115',
          )}
        >
          {label}
        </h3>{' '}
        <span
          className={cn(
            'ml-auto text-09 leading-normal font-mono tracking-label uppercase',
            /* The design draws `NO TAGS` in the accent and every populated
               count in `f-ink-3` — the one row that says nothing yet is the
               one it wants read. `classes-cuisines-1280.html:1514`. */
            count === 0 ? 'text-accent' : 'text-ink-3',
            'shell:ml-0',
          )}
        >
          {tagCount(count)}
        </span>
      </div>
      {blurb ? (
        /* `w-full` at 360 is what makes the row wrap into the drawn column:
           the number and the name share the first line and the description
           takes the whole of the next. */
        <p
          className={cn(
            'm-0 w-full text-13 leading-170 font-sans tracking-flat text-ink-2',
            'shell:w-auto shell:flex-1 shell:text-14 shell:leading-170',
          )}
        >
          {blurb}
        </p>
      ) : null}
    </div>
  );
}

export default async function ClassesPage() {
  const { data, configured, failed } = await safeRead(
    () => listCategories(),
    [],
  );

  /* The ten types in the order `CATEGORY_TYPE_LABELS` declares them, which
     is the order the design draws them in. Reading the map rather than the
     rows is what keeps a type with no tags on the page at all — the design
     draws `Ingredient class` with `NO TAGS` and an empty state, and a group
     built from the rows would simply lose it. */
  const byType = new Map<string, TermWithCount[]>();
  for (const term of data) {
    const list = byType.get(term.categoryType) ?? [];
    list.push(term);
    byType.set(term.categoryType, list);
  }

  const types = Object.keys(CATEGORY_TYPE_LABELS).map((facet) => ({
    facet,
    label: CATEGORY_TYPE_LABELS[facet] ?? facet,
    blurb: CATEGORY_TYPE_BLURBS[facet],
    terms: byType.get(facet) ?? [],
  }));

  const emptyTypes = types.filter((type) => type.terms.length === 0).length;

  const kicker = `${cardinal(types.length)} types · ${cardinal(data.length)} tags`;

  const groups = types.map((type, index) => ({
    key: type.facet,
    heading: (
      <TypeRow
        ordinal={String(index + 1).padStart(2, '0')}
        label={type.label}
        blurb={type.blurb}
        count={type.terms.length}
      />
    ),
    /* The empty type's own sentence, in the design's words and in the
       design's slot — under the description, where the pills would be.
       F/Empty draws it; only the padding and the indent are this screen's,
       because the design tightens it to `p-[ 14px_0 ]` here rather than the
       component's own `40px 24px`. */
    intro:
      type.terms.length === 0 ? (
        <Empty className="items-center px-0 py-3.5 shell:items-start shell:pl-78">
          No tags defined yet — the class list is still being drawn up.
        </Empty>
      ) : undefined,
    items: type.terms.map((term) => ({
      key: term.id,
      /* R-SCR-24. The explanation is in the haystack, so "numbing" finds
         Sichuan even though the pill itself only says "Sichuan". The type's
         own label is in it too, so "preservation" finds every tag under
         it. */
      text: [term.label, type.label, term.description ?? ''].join(' '),
      node: (
        <li key={term.id} className="flex">
          <TermTag term={term} pill />
        </li>
      ),
    })),
    layout: 'list' as const,
    /* The pills: `Tags`, `flex-row gap-[ 8px ] items-center`, indented to sit
       under the description at 1280. `flex-wrap` is this build's — the design
       draws six on one 764px row and the same six have to go somewhere at
       360, where it draws them as stacked rows of the same 8px gap. */
    listClassName: 'flex-row flex-wrap items-center gap-2 shell:pl-78',
  }));

  const unavailable = !configured || failed;

  return (
    <>
      <PageHead
        left="NN · Classification"
        right={unavailable ? 'Unavailable' : kicker}
      />

      <div className="flex w-full flex-col items-start gap-7 px-4 pt-5.5 pb-12 shell:gap-11 shell:px-15 shell:pt-8.5 shell:pb-18">
        {/* The design deletes the trail at 360 and draws two chips in the
            hero instead; the chips are in `PageHero`'s kicker below. */}
        <Breadcrumb
          className="hidden shell:block"
          items={[
            { label: 'Catalogue', href: '/' },
            { label: 'Classification' },
          ]}
        />

        <div className="flex w-full shrink-0 flex-col items-start gap-6 shell:flex-row shell:items-start shell:gap-15">
          {/* `PageHero` is `w-full shrink-0`, so it needs a flex cell of its
              own to share the row with the counts rather than overflow it. */}
          <div className="w-full min-w-0 shell:flex-1">
            <PageHero
              kicker={
                <>
                  <span className="flex flex-row items-center gap-2 shell:hidden">
                    <Mark>Classification</Mark>
                    <MarkQuiet>Index</MarkQuiet>
                  </span>
                  <span className="hidden shell:inline">
                    Classification · Index
                  </span>
                </>
              }
              title="Classification"
              lede="Ten kinds of tag. Each describes a recipe from one angle only, and a recipe carries as many as it needs. The tags travel with the dish, not with any single revision of it."
              ledeClassName="shell:max-w-160"
            />
          </div>

          {/* 200px at 1280, a full-width row of equal columns at 360, and
              the figure steps 19px down to 15px with it. R-STA-01: with no
              database there is nothing to count, and three zeroes would be
              a lie rather than an empty state. */}
          {unavailable ? null : (
            <div className="flex w-full shrink-0 flex-row gap-5 shell:w-50 shell:flex-col shell:gap-6 shell:pt-2">
              <Stat grow label="Types" value={types.length} sizeNarrow="sm" />
              <Stat grow label="Tags" value={data.length} sizeNarrow="sm" />
              <Stat grow label="Empty" value={emptyTypes} sizeNarrow="sm" />
            </div>
          )}
        </div>

        {unavailable ? (
          <DatabaseNotice failed={failed} />
        ) : (
          <>
            <SectionHead
              ordinal={roman(1)}
              title="Types of tag"
              meta={
                emptyTypes > 0
                  ? `${cardinal(types.length)} · ${cardinal(emptyTypes)} not yet populated`
                  : cardinal(types.length)
              }
            />
            {/* The placeholder is written in capitals because F/Filter draws
                it in capitals and does not set `uppercase` — the design's own
                `FILTER BY TITLE, SUMMARY, TAG OR CATALOGUE NUMBER` and
                `FILTER INGREDIENTS` are capitals in the string. The
                accessible name is `label`, in sentence case, so nothing is
                spelled out letter by letter. */}
            <FilterableGroups
              groups={groups}
              label="Filter the tags"
              placeholder="FILTER BY TAG, TYPE OR EXPLANATION"
              countNoun="tag"
            />
          </>
        )}
      </div>
    </>
  );
}
