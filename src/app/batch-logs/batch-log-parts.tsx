import type { ReactNode } from 'react';

import { BatchLine, BatchSource } from '@/components/f/batch-line';
import { citationDate } from '@/components/f/citation';
import { ListMark } from '@/components/f/list-row';
import type { ExperimentSummary } from '@/lib/queries/read';
import { revisionOrdinal } from '@/lib/site';
import { cn } from '@/lib/utils';

/**
 * The two blocks the three batch-log screens share.
 *
 * `/batch-logs`, `/recipes/[slug]/batch-logs` and one run all draw a `f-desk`
 * ledger under the hero, and the first two draw the same ruled list of runs.
 * They sit beside the pages rather than in `src/components/` for the reason
 * `batch-log-detail.tsx` gives: that folder belongs to M4, and Next.js only
 * treats `page`, `layout`, `route` and their siblings as a route, so a
 * component can be colocated with the pages that use it.
 *
 * Server components.
 */

/* ── The ledger ────────────────────────────────────────────────────────── */

/**
 * The `f-desk` band of figures — the design's `Totals` on the two indexes
 * (`batch-logs-1280.html:243`) and its `Figures` on a run (`:2262`).
 *
 * One `[flex:1 1 0]` statistic per figure at 1280 inside `p-[22px_26px]`,
 * and at 360 the same band wraps its statistics into rows inside
 * `p-[16px_14px]` (`m360-batch-search-list.html:150`). `flex-wrap` with a
 * minimum column width is those two drawings in one declaration: the row
 * breaks where the design breaks it and nothing is unmounted.
 *
 * Unlike the ingredient screen's ledger this one keeps its ground at 360.
 * The design draws that difference and it is not an oversight — a run's
 * weights are a ledger the reader reads as a block, and an ingredient's
 * properties are five separate facts.
 */
export function BatchLedger({ children }: { children: ReactNode }) {
  return (
    <div
      className={cn(
        'flex w-full shrink-0 flex-row flex-wrap items-start gap-x-3 gap-y-4 bg-desk px-3.5 py-4',
        'shell:flex-nowrap shell:gap-0 shell:px-6.5 shell:py-5.5',
      )}
    >
      {children}
    </div>
  );
}

/* ── The list of runs ──────────────────────────────────────────────────── */

export type BatchLogRow = ExperimentSummary;

/* ── The row's figures ─────────────────────────────────────────────────── */

/** `7980` grams becomes `7.98 kg`, which is how the design writes a batch. */
function mass(value: number, unit: string): string {
  if (unit === 'g' && value >= 1000) return `${(value / 1000).toFixed(2)} kg`;
  if (!unit) return Number.isInteger(value) ? String(value) : value.toFixed(2);
  return `${Number.isInteger(value) ? value : value.toFixed(2)} ${unit}`;
}

/** `€88.20`. The symbol for the two currencies the archive uses, else the code. */
const CURRENCY_MARKS: Record<string, string> = { EUR: '€', GBP: '£', USD: '$' };

export function money(value: number, currency: string | null): string {
  const code = currency ?? '';
  const mark = CURRENCY_MARKS[code];
  return mark
    ? `${mark}${value.toFixed(2)}`
    : `${value.toFixed(2)} ${code}`.trim();
}

/**
 * The row's meta run — `€88.20 · €46.68 PER KG FINISHED · FIRST REVISION`
 * (`batch-logs-1280.html:394`), and R-SCR-44's `NOT LINKED TO A RECIPE` in
 * the same slot on the run that names none (`m360-batch-search-list.html`).
 *
 * Every part is dropped when its input is missing rather than drawn empty
 * (R-STA-05). PER KG FINISHED is only computable in grams and only when
 * something was actually weighed out, which is true of one of the four runs
 * in the archive — the other three are a cost and a revision.
 */
function rowMeta(log: BatchLogRow): string | undefined {
  const parts: string[] = [];

  if (log.costTotal != null) {
    parts.push(money(log.costTotal, log.currency));
    if (log.finished && log.finished.unit === 'g' && log.finished.value > 0) {
      const perKg = log.costTotal / (log.finished.value / 1000);
      parts.push(`${money(perKg, log.currency)} per kg finished`);
    }
  }

  const ordinal =
    log.revisionNumber != null
      ? revisionOrdinal(log.revisionNumber)
      : undefined;
  if (ordinal) parts.push(ordinal);
  if (!log.recipe) parts.push('Not linked to a recipe');

  return parts.length > 0 ? parts.join(' · ') : undefined;
}

/**
 * `SPENT` — the design's fifth ledger figure (`batch-logs-1280.html:243`).
 *
 * `experiments.cost_total` is on every row and `listExperiments` now selects
 * it, which is the read the M6 build recorded as "one query away". A run
 * with no cost recorded contributes nothing rather than a zero, and with no
 * cost recorded anywhere the figure is not drawn at all (R-STA-05).
 *
 * The three weight figures the design draws beside it — `RAW, TOTAL`,
 * `DRIED, TOTAL` and `MEAN YIELD` — are still NOT drawn, and the reason has
 * not changed: three of the four seeded runs never weighed anything out, so
 * a total and a mean across them would be a figure about the runs that DID
 * record one, printed under a label that claims all of them. The per-row
 * `RAW / DRIED / YIELD` panel states each run's own reading instead, which
 * is the honest half of the same drawing. Recorded here as a deliberate
 * D-12 omission rather than an oversight.
 */
export function spent(logs: BatchLogRow[]): { value: string } | null {
  const priced = logs.filter((log) => log.costTotal != null);
  if (priced.length === 0) return null;
  const total = priced.reduce((sum, log) => sum + (log.costTotal ?? 0), 0);
  return { value: money(total, priced[0]!.currency) };
}

/**
 * The design's `Weights` panel — `RAW / DRIED / YIELD` at the right of every
 * row (`batch-logs-1280.html:420`, `png/QqY5h.png` and `png/u7aBZ.png`).
 *
 * ONE DOM, TWO DRAWINGS. At 1280 it is a 210px `f-desk` column of three
 * label/value rows, each one `justify-between`; at 360 it is a full-width
 * `f-desk` row of three equal columns, each a label over its value
 * (`m360-batch-search-list.html:335`). Nothing is unmounted at either
 * width.
 *
 * IT DRAWS WHAT THE RUN RECORDED AND NOTHING ELSE. The design's own mock
 * fills all three figures on all six of its rows; this archive does not.
 * One of the four seeded runs weighed anything out, so most rows carry RAW
 * alone and one — the run with no observations at all — carries no panel.
 * A YIELD needs both ends and both in the same unit. Inventing the missing
 * halves would put a projection where a measurement belongs, which is the
 * same call `batch-log-detail.tsx` makes about `expected_dried_weight`.
 */
const FIGURE_LABEL =
  'text-09 font-mono tracking-label uppercase whitespace-nowrap text-ink-3';
const FIGURE_VALUE = 'text-13 font-mono tabular-nums whitespace-nowrap';

function Weights({ log }: { log: BatchLogRow }) {
  const figures: { label: string; value: string; accent?: boolean }[] = [];

  if (log.raw)
    figures.push({ label: 'Raw', value: mass(log.raw.value, log.raw.unit) });
  if (log.finished) {
    figures.push({
      label: 'Dried',
      value: mass(log.finished.value, log.finished.unit),
    });
  }
  if (
    log.raw &&
    log.finished &&
    log.raw.unit === log.finished.unit &&
    log.raw.value > 0
  ) {
    figures.push({
      label: 'Yield',
      value: `${((log.finished.value / log.raw.value) * 100).toFixed(1)}%`,
      accent: true,
    });
  }

  /*
   * A run that weighed nothing still holds its column open above the
   * breakpoint. The design rules every row to the same two edges
   * (`png/QqY5h.png`), and `BatchLine` is `flex-1`, so dropping the box
   * let the line grow and slid SOURCE 242px to the right on that one row.
   * Below the breakpoint the row is a column and an empty box would be a
   * gap in the stack, so the spacer is `shell:` only.
   */
  if (figures.length === 0) {
    return (
      <div aria-hidden="true" className="hidden shell:block shell:w-52.5" />
    );
  }

  return (
    <div
      className={cn(
        'flex w-full shrink-0 flex-row items-start gap-3 bg-desk px-3 py-2.5',
        'shell:w-52.5 shell:flex-col shell:gap-2 shell:px-3.5 shell:py-3',
      )}
    >
      {figures.map((figure) => (
        <div
          key={figure.label}
          className={cn(
            'flex flex-1 basis-0 flex-col items-start gap-1',
            'shell:w-full shell:flex-none shell:flex-row shell:items-center shell:justify-between shell:gap-0',
          )}
        >
          {/* R-CMP-14: a flex gap is invisible to `textContent`, so the real
              space is what keeps the label and the figure two values. */}
          <span className={FIGURE_LABEL}>{figure.label}</span>{' '}
          <span
            className={cn(
              FIGURE_VALUE,
              figure.accent ? 'text-accent' : 'text-ink',
            )}
          >
            {figure.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * D-01 — the one live address of a run.
 *
 * A run that names a recipe belongs under that recipe; a run that names none
 * has no recipe slug to put in that shape and stays at the top level. Both
 * indexes link straight at whichever of the two the run's own address is, so
 * the reader never pays for the redirect in `/batch-logs/[log]`.
 */
export function batchLogPath(log: {
  slug: string;
  recipe: { slug: string } | null;
}): string {
  return log.recipe
    ? `/recipes/${log.recipe.slug}/batch-logs/${log.slug}`
    : `/batch-logs/${log.slug}`;
}

export type BatchLogRowsProps = {
  logs: BatchLogRow[];
  /**
   * The SOURCE cell. `/batch-logs` draws it on every row; a recipe's own
   * list does not (`batch-logs-1280.html:1359` against `:360`), because
   * every row there names the recipe in the trail above it.
   */
  source?: boolean;
};

/**
 * The ruled record list — PATTERN C, `batch-logs-1280.html:364`.
 *
 * Each row carries the rule on its TOP and the container is `gap-0`: the
 * rows are separated by their own padding and their own hairline, never by
 * a gap. At 360 the row becomes a column and the 150px SOURCE cell becomes
 * an `F/List mark` chip reading `SOURCE · Baumy Biltong`
 * (`m360-batch-search-list.html:319`).
 *
 * R-SCR-44 AND R-NAV-08 — THE RUN THAT NAMES NO RECIPE. It is listed with
 * the rest, in its own place in date order, at its own top-level address,
 * and both drawings of the SOURCE cell say so in the design's own words:
 * `Not yet linked` in `f-ink-3` at 1280, and at 360 the same words on a chip
 * whose square drops from `f-accent` to `f-hair`. `BatchSource` and
 * `ListMark`'s `muted` already draw both states; the row's own meta says
 * `Not linked to a recipe`, which is the string the design puts there
 * (`m360-batch-search-list.html:873`). Every seeded run names a recipe, so
 * the state cannot be seen on the running site — it is reached only through
 * `logExperiment` with no `recipeSlug`, which K-01 allows.
 */
export function BatchLogRows({ logs, source = true }: BatchLogRowsProps) {
  return (
    <div className="flex w-full flex-col items-start gap-0">
      {logs.map((log) => (
        <div
          key={log.slug}
          className={cn(
            'flex w-full shrink-0 flex-col items-start gap-3 pt-4 pb-4.5',
            'shell:flex-row shell:items-start shell:gap-8',
            /* One four-value declaration and an explicit style: the preflight
               is off until M7, so a lone `border-t` draws nothing. The rule
               is on the TOP of the row, which is what puts a hairline above
               the first one and none under the last. */
            '[border-style:solid] [border-width:1px_0px_0px_0px] border-t-hair',
          )}
        >
          <BatchLine
            className="py-0 shell:flex-1 shell:basis-0"
            lead={log.startedAt ? citationDate(log.startedAt) : undefined}
            title={log.title}
            href={batchLogPath(log)}
            text={log.summary ?? undefined}
            meta={rowMeta(log)}
          />

          {source ? (
            <>
              <BatchSource
                className="hidden shell:flex"
                name={log.recipe?.title}
                href={log.recipe ? `/recipes/${log.recipe.slug}` : undefined}
              />
              <ListMark
                className="shell:hidden"
                form="control"
                muted={!log.recipe}
                name={`SOURCE · ${log.recipe?.title ?? 'Not yet linked'}`}
                href={log.recipe ? `/recipes/${log.recipe.slug}` : undefined}
              />
            </>
          ) : null}

          <Weights log={log} />
        </div>
      ))}
    </div>
  );
}
