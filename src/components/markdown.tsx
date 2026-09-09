/**
 * C-11 — Markdown, set in the design's type.
 *
 * `react-markdown` with `remark-gfm`, as before. GFM stays on because the
 * archive is full of pipe tables — the batch logs are mostly tables, and
 * without GFM they render as unreadable pipe soup. What changed is that
 * every element it emits now takes a drawn role instead of the old
 * `.markdown` stylesheet.
 *
 * THE FINDING THAT GOVERNS THIS FILE. The design does not draw rendered
 * markdown prose anywhere. Across all eighteen exports there is no bulleted
 * list, no blockquote, no `<hr>`, no inline-code chip and no in-body link,
 * and `grep 'underline|text-decoration'` returns nothing at all. What the
 * design does draw is markdown AS SOURCE, verbatim, in a mono block on the
 * archive screen (`list-search-archive-1280.html:4486`) — plus a first-class
 * component for every rich element the archive needs.
 *
 * So the map below takes each markdown node to the role that already carries
 * that job, and marks the three with no drawn role as deliberate additions:
 *
 *   - the list marker (§7.4 of the M4 study) — proposed from the F/Footnote
 *     gutter, which is the design's one "small fixed gutter, one flowing
 *     column" grammar;
 *   - the blockquote — proposed as the design's 3px left rule in the one
 *     rule colour no meaning has taken yet, `f-hair`;
 *   - the body link — NOT a proposal but a requirement. See `PROSE_LINK`.
 *
 * SPACING IS A FLEX GAP, NEVER A MARGIN. Every `Centre` and `Col` in the
 * design is a flex column with an explicit gap. The root here is one, and
 * every child carries `m-0`. That is mandatory rather than tidy: Tailwind's
 * preflight is OFF until M7 and `globals.css` still sets
 * `p { margin: 0 0 1rem }` and `h1..h4 { line-height: 1.25; letter-spacing:
 * -0.015em; margin: 0 0 .5rem }`. Each of those has to be answered by hand,
 * the same way `section-label.tsx` answers them.
 *
 * THE `cn()` TRAP. A size and its leading go in ONE argument. tailwind-merge
 * groups a leading with the font size, and every `--text-NN--line-height` in
 * this theme is the keyword `normal`, so a dropped leading falls back to the
 * face rather than to a value in the table. TOKEN-MAP §4.3.
 *
 * R-CON-01. This stays a Server Component. `react-markdown` is a plain
 * function component with no browser API, and the class map goes through the
 * `components` prop; nothing here needs `"use client"`.
 */

import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { cn } from '@/lib/utils';

import { PROSE_LINK } from './f/button';
import { SectionLabel } from './f/section-label';

/**
 * The four body roles the design draws, by context. A caller says which; the
 * component does not guess.
 *
 * The tone sits on the ROOT and the paragraphs inherit it. `font-size`,
 * `line-height`, `font-family` and `color` all inherit, and a leading written
 * as a ratio is inherited as a ratio — so a heading that sets its own size
 * still computes its own leading correctly.
 */
const TONES = {
  /** Note, step and citation body. The default, drawn everywhere. */
  note: 'text-14 leading-170 font-sans text-ink-2',
  /** The lede under a hero. */
  lede: 'text-16 leading-170 font-sans text-ink-2',
  /** A rationale or a step instruction — primary text, `f-ink`. */
  body: 'text-16 leading-180 font-sans text-ink',
  /** F/Mechanism's explanation. The one body role set in the serif. */
  science: 'text-15 leading-170 font-serif text-ink-2',
  /**
   * Take the type from whatever encloses this prose.
   *
   * For a caller that already sets the role on the slot it drops the markdown
   * into — F/Footnote's `Text`, F/Mechanism's body — and would otherwise have
   * the tone written twice, with the inner one winning. That is not merely
   * redundant: F/Mechanism's body steps from 14px to 15px at `shell:`, and a
   * flat `science` tone inside it would pin 15px at 360 as well.
   */
  inherit: '',
} as const;

export type MarkdownTone = keyof typeof TONES;

/* `PROSE_LINK` moved to `./f/button` beside `FOCUS_RING`, which it composes.
   It is re-exported here because C-11 is where the treatment is used most and
   a reader looking for the body link looks in this file first. */
export { PROSE_LINK };

/* ── The element map ───────────────────────────────────────────────────── */

/*
 * The list. The design draws none, so both kinds take F/Footnote's gutter:
 * a 26px fixed column in 12px Geist Mono and a flowing column beside it.
 *
 * The ordinal comes from a CSS counter rather than from the DOM, because
 * react-markdown 10 no longer passes an index to `li` — the `ordered` and
 * `index` props went in version 9. The counter is reset on each list, so
 * nesting numbers correctly.
 *
 * The unordered marker is `·` and not `•`: the middle dot is the design's
 * one separator glyph, and there is no bullet anywhere in the exports. It
 * takes `f-ink-3` rather than F/Breadcrumb's `f-hair`, which is 1.20:1 and
 * legal only because it sits between two labelled crumbs — a list marker
 * that is the row's only leading mark has to be readable.
 *
 * `list-none`, `m-0` and `p-0` are needed because the preflight is off, so
 * the user agent still draws its own marker and indent.
 */
const LIST = 'm-0 flex w-full list-none flex-col gap-2 p-0';

const ITEM = cn(
  'flex w-full flex-row items-start gap-4',
  'before:w-6.5 before:shrink-0 before:text-12 before:leading-170',
  'before:font-mono before:tabular-nums',
);

/** The flowing column beside the marker. A nested list indents by 16px. */
const ITEM_BODY = cn(
  'flex min-w-0 flex-1 flex-col gap-2',
  '[&>ol]:pl-4 [&>ul]:pl-4',
);

/* One four-value `border-width` and an explicit `border-style`, exactly as
   `notice.tsx` and `note.tsx` write it: with the preflight off, a lone
   `border-l-3` draws nothing and a `border-solid` beside it would give the
   other three sides the CSS initial `medium` width. */
const LEFT_RULE = '[border-style:solid] [border-width:0px_0px_0px_3px]';

const CELL_RULE = '[border-style:solid] [border-width:0px_0px_1px_0px]';

/**
 * Is this cell a number? R-CON-06 says every number takes the mono face with
 * tabular figures, and a markdown table does not say which column is which.
 *
 * The test is deliberately narrow: digits, separators, and at most one short
 * unit at the end. `232 °C`, `45 MIN` and `10.2 kg` match; `1 tbsp sugar`
 * and `Ground beef` do not. A false negative leaves a number in the sans,
 * which is the state the whole archive is in today; a false positive would
 * put a sentence in the mono face, which is worse.
 */
function looksNumeric(children: ReactNode): boolean {
  const value =
    typeof children === 'string'
      ? children
      : Array.isArray(children) && children.every((c) => typeof c === 'string')
        ? children.join('')
        : null;
  if (value === null) return false;

  const trimmed = value.trim();
  if (!/\d/.test(trimmed)) return false;
  return /^[+-]?[\d\s.,:/×°%–—-]+(?:\s?[A-Za-z°%]{1,4})?$/.test(trimmed);
}

const COMPONENTS: Components = {
  /* The tone is on the root and inherits. A paragraph only has to undo the
     old stylesheet's bottom margin. */
  p: ({ children }) => <p className="m-0">{children}</p>,

  /*
   * A markdown body must not draw a second page title, so `h1` starts where
   * the section titles do. F/Section label is the drawn role — a 26px
   * Newsreader title over a hairline — and it is reused rather than
   * restated.
   */
  h1: ({ children }) => <SectionLabel as="h1" title={children} />,
  h2: ({ children }) => <SectionLabel as="h2" title={children} />,

  /* The phase head on the recipe screen (`recipe-1280.html:1965`): a 24px
     serif italic followed by a hairline that fills the row. */
  h3: ({ children }) => (
    <div className="flex w-full flex-row items-center gap-4">
      <h3 className="m-0 text-24 leading-normal font-serif font-medium tracking-flat text-ink italic">
        {children}
      </h3>
      <span aria-hidden="true" className="h-px flex-1 bg-hair" />
    </div>
  ),

  /* F/Mechanism's `Name` — Newsreader at weight 400, not 500. */
  h4: ({ children }) => (
    <h4 className="m-0 text-19 leading-130 font-serif font-normal tracking-flat text-ink">
      {children}
    </h4>
  ),

  /* F/Footnote's `Title`. */
  h5: ({ children }) => (
    <h5 className="m-0 text-16 leading-normal font-serif font-medium tracking-flat text-ink">
      {children}
    </h5>
  ),

  /* The mono micro-label, which the design draws about five hundred times. */
  h6: ({ children }) => (
    <h6 className="m-0 text-09 leading-normal font-mono font-normal tracking-label text-ink-3 uppercase">
      {children}
    </h6>
  ),

  /*
   * `start` is carried. GFM writes `<ol start="3">` for a list a paragraph
   * interrupted, and the ordinal here comes from a CSS counter rather than
   * from the DOM — react-markdown 10 no longer passes an index to `li`. A
   * counter reset to 0 on every list would silently renumber a continuation
   * from 1. The counter is reset to `start - 1` when there is one, so the
   * first item still increments to `start`.
   */
  ol: ({ children, start }) => (
    <ol
      style={
        typeof start === 'number' && start !== 1
          ? ({ counterReset: `md-item ${start - 1}` } as CSSProperties)
          : undefined
      }
      className={cn(
        LIST,
        typeof start === 'number' && start !== 1
          ? null
          : '[counter-reset:md-item]',
        '[&>li]:[counter-increment:md-item]',
        '[&>li]:before:content-[counter(md-item)] [&>li]:before:text-ink',
      )}
    >
      {children}
    </ol>
  ),

  ul: ({ children }) => (
    <ul
      className={cn(
        LIST,
        "[&>li]:before:content-['·']",
        '[&>li]:before:text-ink-3',
      )}
    >
      {children}
    </ul>
  ),

  li: ({ children }) => (
    <li className={ITEM}>
      <div className={ITEM_BODY}>{children}</div>
    </li>
  ),

  /*
   * The archive's verbatim source block (`File`): a `f-desk` ground, 20px
   * over 22px of padding, an optional filename, a hairline, and 12px over
   * 22px Geist Mono.
   *
   * `overflow-x-auto` is R-STA-08 and R-STA-09 together. The design's block
   * wraps its own content by hand; a real code line will not, and the page
   * body must never scroll sideways.
   */
  pre: ({ children }) => (
    <pre className="m-0 flex w-full flex-col items-start gap-3 overflow-x-auto rounded-none border-0 bg-desk px-5.5 py-5 text-12 leading-180 font-mono whitespace-pre text-ink">
      {children}
    </pre>
  ),

  /*
   * One component, two jobs. Inside a fence with an info string the language
   * becomes the design's `Filename` label over a `Rule`; everywhere else it
   * is the inline form.
   *
   * The inline form has NO ground. `f-desk` on `f-paper` is 1.12:1
   * (TOKEN-MAP §7) and a chip nobody can see is worse than no chip. The
   * design agrees: it sets `DATABASE_URL` in the running Geist with no
   * distinguishing treatment at all (`plates-3-4.html:1020`).
   *
   * `[font-size:inherit]` undoes `globals.css`'s `code { font-size: .9em }`
   * without inventing a size; the face is what carries the role.
   */
  code: ({ className, children }) => {
    const language = /\blanguage-([\w-]+)/.exec(className ?? '')?.[1];
    if (!language) {
      return (
        <code className="[font-size:inherit] font-mono text-ink">
          {children}
        </code>
      );
    }
    return (
      <>
        <span className="text-09 leading-normal font-mono tracking-label text-ink-3 uppercase">
          {language}
        </span>
        <span aria-hidden="true" className="h-px w-full shrink-0 bg-hair" />
        <code className="w-full [font-size:inherit] font-mono text-ink">
          {children}
        </code>
      </>
    );
  },

  /*
   * Not drawn. The design's only "set-aside block" grammar is the 3px left
   * rule, and all four of its colours are already spoken for: `f-accent` is
   * F/Notice, `f-warn` is F/Warning, transparent is the unchanged-step
   * marker, and `f-ink-3` is the no-database notice. `f-hair` is the one
   * rule colour with no meaning on it.
   *
   * The quoted body takes the design's quiet voice — the same serif italic
   * `f-ink-2` it gives `F/Empty > Text`, the hero subtitle and the table's
   * alias column. It inherits into the paragraphs.
   */
  blockquote: ({ children }) => (
    <blockquote
      className={cn(
        'm-0 flex w-full flex-col gap-4 border-l-hair pl-4',
        LEFT_RULE,
        'text-15 leading-170 font-serif text-ink-2 italic',
      )}
    >
      {children}
    </blockquote>
  ),

  /* The design's `Rule` element, drawn everywhere: one hairline pixel. */
  hr: () => <hr className="m-0 h-px w-full border-0 bg-hair" />,

  /*
   * R-STA-08: a wide table scrolls inside its own container. R-STA-09: the
   * page body never scrolls sideways. The wrapper is what makes both true,
   * and it is the reason the old `.markdown table { white-space: nowrap }`
   * can go — a table that scrolls does not need its cells kept on one line.
   *
   * The head rule is `f-hair` and the body rules are `f-hair-2`; that
   * difference is the whole hierarchy in F/Table row. `f-hair-2` in the dark
   * theme is `#222629`, a value no dark screen draws — TOKEN-MAP §8 parks it
   * with the designer. It is written here as the declared token rather than
   * quietly substituted.
   */
  table: ({ children }) => (
    <div className="w-full overflow-x-auto">
      <table className="m-0 w-full border-collapse text-left">{children}</table>
    </div>
  ),

  /*
   * `bg-transparent` and `pt-0` answer two rules in the `legacy` layer that
   * no other utility here reaches: `globals.css` gives `thead th` a
   * `--surface-2` fill and `th, td` a `0.5rem 0.8rem` padding, and this cell
   * writes `px-0 pb-2.5` — which leaves the ground and the top padding
   * standing until M7 deletes the stylesheet. The design draws no ground on
   * a table head; `f/table-row.tsx` says the same.
   */
  th: ({ children, style }) => (
    <th
      style={style}
      className={cn(
        'border-b-hair bg-transparent px-0 pt-0 pb-2.5 text-left align-bottom',
        CELL_RULE,
        'text-09 leading-normal font-mono font-normal tracking-label text-ink-3 uppercase',
        '[&:not(:last-child)]:pr-5',
      )}
    >
      {children}
    </th>
  ),

  td: ({ children, style }) => (
    <td
      style={style}
      className={cn(
        'border-b-hair-2 px-0 py-2.75 align-top',
        CELL_RULE,
        looksNumeric(children)
          ? 'text-12 leading-normal font-mono tabular-nums text-ink'
          : 'text-14 leading-150 font-sans text-ink',
        '[&:not(:last-child)]:pr-5',
      )}
    >
      {children}
    </td>
  ),

  /* Weight 500 in whichever face the paragraph is in — the design's one
     emphasis weight. `font-bold` would be a weight neither face loads. */
  strong: ({ children }) => <strong className="font-medium">{children}</strong>,

  em: ({ children }) => <em className="italic">{children}</em>,

  /*
   * The design draws an `Image` and a `Caption` as a pair, and that pair is
   * M5's. A markdown image gets the minimum that keeps it inside the frame:
   * no radius, because the design is square (TOKEN-MAP §4.5).
   */
  img: ({ src, alt }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={typeof src === 'string' ? src : undefined}
      alt={alt ?? ''}
      className="m-0 h-auto max-w-full rounded-none"
    />
  ),

  /*
   * An address inside the app goes through `next/link` so the navigation
   * stays client side; one that leaves the app is a plain anchor. A bare
   * fragment stays an anchor — `Link` on a `#hash` would push a route.
   */
  a: ({ href, children }) => {
    const address = typeof href === 'string' ? href : '';
    if (address.startsWith('/')) {
      return (
        <Link href={address} className={PROSE_LINK}>
          {children}
        </Link>
      );
    }
    if (address.startsWith('#') || address === '') {
      return (
        <a href={address || undefined} className={PROSE_LINK}>
          {children}
        </a>
      );
    }
    return (
      <a
        href={address}
        rel="noreferrer nofollow"
        target="_blank"
        className={PROSE_LINK}
      >
        {children}
      </a>
    );
  },
};

export type MarkdownProps = {
  children: string;
  /** Which of the four drawn body roles this prose is. */
  tone?: MarkdownTone;
  className?: string;
};

/**
 * C-11 — Markdown with GFM, set in the design's type.
 */
export function Markdown({
  children,
  tone = 'note',
  className,
}: MarkdownProps) {
  return (
    <div
      /* `break-words` is inherited, so one declaration on the root covers
         every paragraph, cell and link under it. A 60-character address in
         an archived note is what R-STA-09 fails on otherwise. */
      className={cn(
        'flex w-full flex-col gap-4 break-words',
        TONES[tone],
        className,
      )}
    >
      <ReactMarkdown components={COMPONENTS} remarkPlugins={[remarkGfm]}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
