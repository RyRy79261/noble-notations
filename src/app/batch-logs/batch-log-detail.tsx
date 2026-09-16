import type { ReactNode } from 'react';
import type { ExperimentView } from '@/lib/queries/read';
import { NoteList } from '@/components/notes';
import { Markdown } from '@/components/markdown';
import { FOCUS_RING } from '@/components/f/button';
import { citationDate } from '@/components/f/citation';
import { PageHead, PageHero } from '@/components/f/page-head';
import { SectionHead } from '@/components/f/section-label';
import { Stat } from '@/components/f/stat';
import { cardinal, revisionOrdinal, roman } from '@/lib/site';
import { cn } from '@/lib/utils';

import { BatchLedger } from './batch-log-parts';

/**
 * The body of one run — `batch-logs-1280.html:2198`.
 *
 * Two routes draw it. `/batch-logs/[log]` serves a run that names no recipe;
 * `/recipes/[slug]/batch-logs/[log]` serves one that does. D-01 gives each
 * run exactly one live address, so the two pages differ only in the trail
 * above the title — everything below it is this component, which is why it
 * exists rather than the same 250 lines twice.
 *
 * It sits beside the pages instead of in `src/components/` because that
 * folder belongs to M4. Nothing here is a route: Next.js only treats `page`,
 * `layout`, `route` and their siblings as one, so a component can be
 * colocated with the pages that use it.
 *
 * The trail arrives as a node. Each route knows its own place in the site
 * and this component should not have to work it out from the data. A Server
 * Component may pass JSX across a boundary but not a function (R-CON-02), so
 * a node is also the only shape that stays safe if either page later becomes
 * a client component.
 *
 * WHAT THE DESIGN DRAWS AND WHAT THE ARCHIVE HOLDS. The design's run has
 * three numbered sections: `I What was bought`, `II How it went`, and
 * `III Per-piece drying record`. Nothing in `experiments` records a purchase
 * — no supplier, no price per kilogram raw, no cutting note — so the
 * provenance block has no rows to draw and is dropped rather than filled
 * with the summary rewritten three ways (R-STA-05). The two sections that do
 * have data keep the design's shape and take the ordinals `I` and `II`.
 */
export function BatchLogDetail({
  log,
  breadcrumb,
}: {
  log: ExperimentView;
  breadcrumb: ReactNode;
}) {
  const table = pivot(log);
  const figures = ledger(log);

  const started = log.startedAt ? citationDate(log.startedAt) : null;
  const completed = log.completedAt ? citationDate(log.completedAt) : null;

  const headRight =
    [started, completed && completed !== started ? completed : null]
      .filter(Boolean)
      .join(' — ') || 'Batch log';

  /*
   * The run's own slot for the same fact `rowMeta` states on the two indexes
   * (§4.3): the version this run cooked has been deleted.
   *
   * IT IS DRAWN ONLY WHEN THE VERSION IS WITHDRAWN, and that is deliberate.
   * This screen has never printed the revision at all — the kicker is the
   * recipe and the date — so printing the ordinal on every run would be a
   * change to every batch log page in aid of a state none of them is in.
   * Naming the number here is what makes `withdrawn` mean something: the
   * design's answer is that the run keeps its number and says the version is
   * gone, and a bare "withdrawn" would not say what was.
   */
  const withdrawn =
    log.revisionWithdrawn && log.revisionNumber != null
      ? `${revisionOrdinal(log.revisionNumber)} · withdrawn`
      : null;

  const kicker =
    [log.recipe?.title ?? 'Batch log', withdrawn, started]
      .filter(Boolean)
      .join(' · ') || 'Batch log';

  /* `II` when the outcome section is drawn above it, `I` when it is not. */
  const hasAccount = Boolean(log.outcome) || log.notes.length > 0;
  const tableOrdinal = roman(hasAccount ? 2 : 1);

  return (
    <>
      <PageHead
        left={
          log.recipe
            ? `NN · ${log.recipe.title} · ${log.title}`
            : `NN · Batch logs · ${log.title}`
        }
        leftNarrow={`NN · ${log.title}`}
        right={headRight}
      />

      <div className="flex w-full flex-col items-start gap-7 px-4 pt-5.5 pb-12 shell:gap-11 shell:px-15 shell:pt-8.5 shell:pb-18">
        {breadcrumb}

        <PageHero
          kicker={kicker}
          title={log.title}
          ledeClassName="shell:max-w-190"
          lede={log.summary ?? undefined}
        />

        {figures.length > 0 ? (
          <BatchLedger>
            {figures.map((figure) => (
              <Stat
                key={figure.label}
                grow
                size="lg"
                sizeNarrow="sm"
                className="min-w-25"
                label={figure.label}
                value={figure.value}
              />
            ))}
          </BatchLedger>
        ) : null}

        {hasAccount ? (
          <>
            <SectionHead
              ordinal={roman(1)}
              title="How it went"
              meta={accountMeta(log)}
            />
            {/* `note` is the 14/24 Geist in `f-ink-2` the design sets every
                body run in on this screen, and it is `Markdown`'s default —
                stated rather than left implicit because `outcome` is the one
                block of free prose on the page. */}
            {log.outcome ? (
              <Markdown tone="note">{log.outcome}</Markdown>
            ) : null}
            {/* The notes carry the design's numbered apparatus, and a
                `warning` note is where `WHAT WENT WRONG` is drawn — the
                `f-warn-wash` ground and the 3px rule at
                `batch-logs-1280.html:2525`. `NoteList` routes it. */}
            <NoteList notes={log.notes} />
          </>
        ) : null}

        {table ? (
          <>
            <SectionHead
              ordinal={tableOrdinal}
              title="Per-piece record"
              meta={`${cardinal(table.rows.length)} piece${
                table.rows.length === 1 ? '' : 's'
              } · ${cardinal(table.columns.length)} reading${
                table.columns.length === 1 ? '' : 's'
              } each`}
            />
            <MeasurementTable label={log.title} table={table} />
            <p className="m-0 w-full text-13 leading-150 font-serif text-ink-3 italic">
              Weights as they were written down, in the units they were recorded
              in. The table scrolls sideways inside its own box; the page does
              not move with it.
            </p>
          </>
        ) : null}
      </div>
    </>
  );
}

/* ── The measurements ──────────────────────────────────────────────────── */

type Column = { metric: string; label: string };
type Row = { item: string; values: Map<string, string> };
type Table = { columns: Column[]; rows: Row[] };

/**
 * Observations arrive as (item, metric, value) triples. Pivot them into one
 * row per item with a column per metric — that is how they were recorded on
 * paper and the only shape in which a batch is readable at a glance.
 *
 * The unit rides in the COLUMN HEAD and not in the cell. The design writes
 * `RAW g` over a column of bare figures (`batch-logs-1280.html:2626`), which
 * is what lets a reader compare a column at a glance; `412 g` repeated
 * twelve times is the same information drawn twice as wide. A metric whose
 * observations disagree about the unit keeps its unit in each cell, because
 * then the head cannot state one truthfully.
 */
function pivot(log: ExperimentView): Table | null {
  if (log.observations.length === 0) return null;

  const units = new Map<string, Set<string>>();
  for (const observation of log.observations) {
    const set = units.get(observation.metric) ?? new Set<string>();
    if (observation.unit) set.add(observation.unit);
    units.set(observation.metric, set);
  }

  const columns: Column[] = [...units.keys()].map((metric) => {
    const unit = units.get(metric);
    const one = unit && unit.size === 1 ? [...unit][0] : undefined;
    const name = metric.replace(/_/g, ' ');
    return { metric, label: one ? `${name} ${one}` : name };
  });

  const rows = new Map<string, Map<string, string>>();
  for (const observation of log.observations) {
    const key = observation.item ?? '—';
    const row = rows.get(key) ?? new Map<string, string>();
    const unit = units.get(observation.metric);
    const shared = unit ? unit.size === 1 : false;
    const rendered =
      observation.value != null
        ? shared || !observation.unit
          ? String(observation.value)
          : `${observation.value} ${observation.unit}`
        : (observation.note ?? '');
    row.set(observation.metric, rendered);
    rows.set(key, row);
  }

  return {
    columns,
    rows: [...rows.entries()].map(([item, values]) => ({ item, values })),
  };
}

/* The two rules. One four-value declaration and an explicit style each,
   which is the form the export draws; it was forced while the preflight was
   off, up to M7, when a lone `border-b` drew nothing at all. `f-hair` under
   the head, `f-hair-2` under a body row — the whole hierarchy of this table
   is those two colours, exactly as `F/Table row` builds it. */
const HEAD_RULE =
  '[border-style:solid] [border-width:0px_0px_1px_0px] border-b-hair';
const ROW_RULE =
  '[border-style:solid] [border-width:0px_0px_1px_0px] border-b-hair-2';

/*
 * THE LABEL WRAPS, AND THE DESIGN'S DOES NOT NEED TO.
 *
 * The design sets every column head `white-space: nowrap` because its own
 * metric names are two words at most — `RAW g`, `WASHED g`, `DAY 1 g`,
 * `FINAL g` — inside fixed 84 to 96px cells. The archive's metric names are
 * not: `expected_dried_weight` renders as `EXPECTED DRIED WEIGHT G`, which
 * wants 143px in a 92px cell. With `nowrap` it printed straight over the
 * next column's label at 1280 and over the next reading's label inside
 * every 360 row — `EXPECTED DRIED WEGROSSSGWEIGHT G` on a 3× crop.
 *
 * The columns are laid out row by row, so they only line up while every
 * cell in a column is the same fixed width; letting a cell size to its
 * content would take the table apart. So the width stays and the label
 * wraps inside it. The head row is `items-end` above the fold for the same
 * reason a real table's is: a three-line label and a one-line label then
 * share the baseline that sits on the rule. With the design's own short
 * labels every cell is one line and `items-end` and `items-center` draw
 * the same pixels.
 */
const HEAD_CELL = 'text-09 font-mono tracking-label uppercase text-ink-3';

/* 44px and 120px at 1280; 22px and the rest of the first line at 360. */
const NO_COL = 'w-5.5 shrink-0 shell:w-11';
const ITEM_COL = 'min-w-0 flex-1 shell:w-30 shell:flex-none shell:shrink-0';
const VALUE_COL = 'shell:w-23 shell:shrink-0 shell:text-right';

/**
 * The per-piece record — `batch-logs-1280.html:2596`, and its 360 fold at
 * `m360-batch-search-list.html:2340`.
 *
 * TWO DRAWINGS, ONE DOM. At 1280 it is a twelve-column table inside a
 * viewport that scrolls sideways while the page stays put (R-STA-08 and
 * R-STA-09; the design's own caption says so). At 360 the row folds: the
 * number and the cut keep one line and the readings drop into a `f-desk`
 * block beneath them, each one a label over a figure. Nothing is unmounted
 * at either width, so a reader who rotates the phone loses no scroll
 * position and a screen reader is never read the same figure twice.
 *
 * WHY THE ROLES AND NOT A `<table>`. `display: flex` on a `<tr>` is exactly
 * the change that strips a real table of its semantics, and the fold above
 * needs flex at both widths. `f/table-row.tsx` makes the same call for the
 * ingredient index and states the reasoning at length; this table has a
 * variable number of columns and a `f-desk` readings block, so it is built
 * here rather than bent out of that component.
 *
 * The column head is drawn only at `shell:`. Below it the head would label
 * nothing — each cell carries its own label — so it is `display: none` and
 * out of the accessibility tree with it, rather than a second voice reading
 * every figure's name twice.
 */
function MeasurementTable({ label, table }: { label: string; table: Table }) {
  return (
    /* The design's `Table viewport`. R-STA-08 lives on this one declaration:
       the scroller is the box around the table and never the page.

       `FOCUS_RING` for the reason the note on `f/mass-flow.tsx`'s scroll box
       gives: Chromium makes an overflowing scroll container keyboard-
       focusable with no `tabindex`, and until M7 the ring came from the
       global `:focus-visible` rule in `globals.css`. No seeded run has
       enough columns to overflow at any audited width, so nothing here was
       measured losing a ring; the class stops a wider run acquiring the
       fault. */
    <div className={cn('w-full overflow-x-auto', FOCUS_RING)}>
      <div
        role="table"
        aria-label={`Measurements for ${label}`}
        className="flex w-full flex-col items-start gap-0 shell:w-max shell:min-w-full"
      >
        <div role="rowgroup" className="flex w-full flex-col gap-0">
          <div
            role="row"
            className={cn(
              'hidden shell:flex shell:w-full shell:shrink-0 shell:flex-row shell:items-end shell:gap-2 shell:pb-2.5',
              HEAD_RULE,
            )}
          >
            <span role="columnheader" className={cn(HEAD_CELL, NO_COL)}>
              No.
            </span>{' '}
            <span role="columnheader" className={cn(HEAD_CELL, ITEM_COL)}>
              Item
            </span>{' '}
            {table.columns.map((column) => (
              <span
                role="columnheader"
                key={column.metric}
                className={cn(HEAD_CELL, VALUE_COL)}
              >
                {column.label}
              </span>
            ))}
          </div>
        </div>

        <div role="rowgroup" className="flex w-full flex-col gap-0">
          {table.rows.map((row, index) => (
            <div
              role="row"
              key={row.item}
              className={cn(
                'flex w-full shrink-0 flex-row flex-wrap items-center gap-x-3 gap-y-2 pt-3.25 pb-3.5',
                'shell:flex-nowrap shell:gap-x-2 shell:gap-y-0 shell:py-2.75',
                ROW_RULE,
              )}
            >
              {/* R-CMP-14's construct, the same one `F/Table row` uses. A
                  flex gap is invisible to `textContent`, so without these
                  real spaces the row reads "01thick end412425" to a screen
                  reader and to a copy-paste. A whitespace-only text run is
                  not rendered as a flex item (CSS Flexbox §4), so nothing
                  drawn moves. */}
              <span
                role="cell"
                className={cn(
                  'text-11 font-mono tabular-nums text-ink-3',
                  NO_COL,
                )}
              >
                {String(index + 1).padStart(2, '0')}
              </span>{' '}
              <span
                role="cell"
                className={cn('text-14 font-sans text-ink', ITEM_COL)}
              >
                {row.item}
              </span>{' '}
              {/* The readings. One `f-desk` block below the fold and, at
                  `shell:`, `display: contents` — the block disappears and its
                  cells become cells of the row again, which is the 1280
                  drawing exactly. */}
              <div className="flex w-full flex-row flex-wrap items-start gap-3 bg-desk px-3 py-2.5 shell:contents">
                {table.columns.map((column) => (
                  <span
                    role="cell"
                    key={column.metric}
                    className={cn(
                      'flex min-w-16 flex-1 flex-col items-start gap-1',
                      'shell:block shell:flex-none shell:grow-0',
                      VALUE_COL,
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(HEAD_CELL, 'shell:hidden')}
                    >
                      {column.label}
                    </span>{' '}
                    <span className="text-12 font-mono tabular-nums text-ink shell:text-13">
                      {row.values.get(column.metric) ?? '—'}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── The ledger ────────────────────────────────────────────────────────── */

/**
 * The metric that means "what went in", in the order it is preferred.
 *
 * `net_weight` first because it is the meat after the hook is subtracted,
 * which is what every yield in the archive is computed against; the other
 * two are what a run records when it never weighed a hook.
 */
const RAW_METRICS = ['net_weight', 'initial_weight', 'gross_weight'];

/**
 * And "what came out". `final_weight` ONLY.
 *
 * `expected_dried_weight` is on two runs and it is an expectation — net
 * times 0.45 — not a reading. Drawing it as FINISHED would put a projection
 * in a ledger of measurements and let a yield be computed from it, which is
 * how a planning figure becomes a fact nobody can trace.
 */
const FINISHED_METRICS = ['final_weight'];

type Figure = { label: string; value: string };

/**
 * The `f-desk` band under the hero — the design's `Figures`
 * (`batch-logs-1280.html:2262`): RAW, FINISHED, YIELD, COST, PER KG FINISHED
 * and PIECES.
 *
 * Every figure here is either a recorded field or a sum of recorded
 * readings, and a figure whose inputs are missing is not drawn (R-STA-05).
 * Two of the four runs in the archive record no final weight, so on those
 * the band is RAW, COST and PIECES and there is no yield to state — which is
 * the honest drawing of a run nobody weighed out.
 */
function ledger(log: ExperimentView): Figure[] {
  const raw = total(log, RAW_METRICS);
  const finished = total(log, FINISHED_METRICS);
  const figures: Figure[] = [];

  if (raw) figures.push({ label: 'Raw', value: mass(raw.value, raw.unit) });
  if (finished) {
    figures.push({
      label: 'Finished',
      value: mass(finished.value, finished.unit),
    });
  }
  if (raw && finished && raw.unit === finished.unit && raw.value > 0) {
    figures.push({
      label: 'Yield',
      value: `${((finished.value / raw.value) * 100).toFixed(1)}%`,
    });
  }

  const currency = log.currency ?? '';
  if (log.costTotal != null) {
    figures.push({
      label: 'Cost',
      value: `${log.costTotal.toFixed(2)} ${currency}`.trim(),
    });

    /* Per kilogram of what actually came out, which is the number the
       archive argues about. Only computable in grams, and only when
       something was weighed out. */
    if (finished && finished.unit === 'g' && finished.value > 0) {
      const perKg = log.costTotal / (finished.value / 1000);
      figures.push({
        label: 'Per kg finished',
        value: `${perKg.toFixed(2)} ${currency}`.trim(),
      });
    }
  }

  if (log.items.length > 0) {
    figures.push({ label: 'Pieces', value: String(log.items.length) });
  }
  if (log.scaleFactor != null && log.scaleFactor !== 1) {
    figures.push({ label: 'Scale', value: `×${log.scaleFactor}` });
  }

  return figures;
}

/**
 * The sum of the first of these metrics the run actually recorded, with the
 * unit it recorded it in. `null` when the run recorded none of them, or when
 * the readings disagree about the unit — a sum across two units is a number
 * with no meaning and the design has no slot for a footnote about it.
 */
function total(
  log: ExperimentView,
  metrics: readonly string[],
): { value: number; unit: string } | null {
  for (const metric of metrics) {
    const readings = log.observations.filter(
      (observation) =>
        observation.metric === metric && observation.value != null,
    );
    if (readings.length === 0) continue;

    const units = new Set(readings.map((reading) => reading.unit ?? ''));
    if (units.size !== 1) return null;

    return {
      value: readings.reduce((sum, reading) => sum + (reading.value ?? 0), 0),
      unit: [...units][0] ?? '',
    };
  }
  return null;
}

/** `7980` grams becomes `7.98 kg`, which is how the design writes a batch. */
function mass(value: number, unit: string): string {
  if (unit === 'g' && value >= 1000) return `${(value / 1000).toFixed(2)} kg`;
  return unit ? `${round(value)} ${unit}` : String(round(value));
}

function round(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

/**
 * The section meta — the count, then the one fact that answers the reader's
 * next question. The design's own is `ONE FIX · ONE FAILURE`, which is the
 * notes counted by tier, so this counts them the same way.
 */
function accountMeta(log: ExperimentView): string | undefined {
  const warnings = log.notes.filter((note) => note.kind === 'warning').length;
  const rest = log.notes.length - warnings;

  const parts = [
    rest > 0 ? `${cardinal(rest)} note${rest === 1 ? '' : 's'}` : null,
    warnings > 0
      ? `${cardinal(warnings)} failure${warnings === 1 ? '' : 's'}`
      : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(' · ') : undefined;
}
