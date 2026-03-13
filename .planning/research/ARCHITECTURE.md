# Architecture Research

**Domain:** Interactive React components in a Docusaurus 3.x static documentation site
**Researched:** 2026-03-13
**Confidence:** HIGH (Docusaurus MDX patterns well-documented; data layer patterns MEDIUM — standard webpack/ESM, no official Docusaurus data-loading guide beyond plugins)

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     MDX Content Layer                           │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐        │
│  │  batch2.mdx   │  │  batch5.mdx   │  │  calculators  │        │
│  │  (log page)   │  │  (log page)   │  │  .mdx page    │        │
│  └──────┬────────┘  └──────┬────────┘  └──────┬────────┘        │
│         │ import            │ import            │ import          │
├─────────┼───────────────────┼───────────────────┼────────────────┤
│                  React Component Layer                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │
│  │BatchChart    │  │BatchCompare  │  │SpiceCalc     │            │
│  │(recharts)    │  │(table diff)  │  │(stateful)    │            │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘            │
│         │                 │                 │                    │
│  ┌──────┴─────────────────┴─────────────────┴───────┐            │
│  │               Shared Utilities                    │            │
│  │  formatWeight()  calcYield()  formatCurrency()    │            │
│  └──────────────────────────────────────────────────┘            │
├─────────────────────────────────────────────────────────────────┤
│                      Data Layer                                  │
│  ┌──────────────────────┐   ┌─────────────────────────┐          │
│  │  src/data/batches/   │   │  Markdown frontmatter   │          │
│  │  batch2.json         │   │  (narrative, notes)     │          │
│  │  batch3.json         │   │                         │          │
│  │  batch4.json         │   │  Source of truth for    │          │
│  │  batch5.json         │   │  human-readable prose   │          │
│  │                      │   │                         │          │
│  │  Structured numeric  │   │                         │          │
│  │  data for components │   │                         │          │
│  └──────────────────────┘   └─────────────────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| `BatchChart` | Render trend lines across batches (yield %, cost/kg, drying days) | Recharts `LineChart` or `BarChart`; receives array of batch summaries as prop |
| `BatchCompare` | Side-by-side diff of two selected batches | Table-based React component; accepts two batch data objects |
| `SpiceCalculator` | Given meat weight input, compute all spice quantities | Stateful form component; formula logic in `src/data/recipes/` |
| `CostCalculator` | Compute cost/kg finished product from ingredient prices | Stateful form; reads ingredient price list from JSON |
| `PieceWeightTable` | Render sortable piece-weight breakdown for one batch | Wraps existing markdown table pattern with sort/filter |
| `BatchSummaryCard` | Single-batch at-a-glance stats (yield, cost, days) | Display-only; driven entirely by props from JSON |

## Recommended Project Structure

```
noble-notations/
├── src/
│   ├── css/
│   │   └── custom.css              # Existing global theme overrides
│   ├── components/
│   │   ├── charts/
│   │   │   ├── BatchTrendChart.tsx  # Cross-batch line/bar charts
│   │   │   └── YieldDistribution.tsx
│   │   ├── calculators/
│   │   │   ├── SpiceCalculator.tsx  # Stateful scaling calculator
│   │   │   └── CostCalculator.tsx   # Stateful cost estimator
│   │   ├── batch/
│   │   │   ├── BatchCompare.tsx     # Side-by-side batch diff
│   │   │   ├── BatchSummaryCard.tsx # At-a-glance stats card
│   │   │   └── PieceWeightTable.tsx # Sortable piece table
│   │   └── ui/
│   │       ├── DataTable.tsx        # Generic sortable table primitive
│   │       └── StatCard.tsx         # Generic labeled stat display
│   └── data/
│       ├── batches/
│       │   ├── batch2.json          # Structured numeric data per batch
│       │   ├── batch3.json
│       │   ├── batch4.json
│       │   └── batch5.json
│       ├── recipes/
│       │   └── biltong-base.json    # Spice ratios, base formulas
│       └── types.ts                 # TypeScript interfaces for batch data
├── docs/
│   ├── biltong_logs/
│   │   ├── batch2.mdx               # Renamed .md → .mdx to enable JSX
│   │   ├── batch5.mdx
│   │   └── _category_.json
│   └── tools/
│       ├── spice-calculator.mdx     # Calculator page (imports component)
│       └── batch-comparison.mdx     # Comparison tool page
└── static/
    └── img/
```

### Structure Rationale

- **src/components/charts/**: Chart components are pure display — they receive data via props and render SVGs. No business logic lives here.
- **src/components/calculators/**: Calculator components own local state (user inputs) and formula logic. They are self-contained features, not primitives.
- **src/components/batch/**: Batch-specific display components. Know the batch data shape but don't fetch it — they receive it as props.
- **src/components/ui/**: Generic primitives reused across batch, chart, and calculator families. No domain knowledge.
- **src/data/batches/**: JSON files are the canonical structured data source. MDX pages import these directly as ES modules — no fetch() needed. This is the key architectural choice.
- **src/data/types.ts**: Single source of truth for data shapes. Components import these interfaces; the JSON files satisfy them.

## Architectural Patterns

### Pattern 1: JSON-as-Module (Static Import for Client-Side Data)

**What:** Store structured batch data as `.json` files in `src/data/`. Import them directly in MDX or component files using ESM import syntax. Webpack handles JSON module resolution — no `fetch()` required.

**When to use:** All structured numeric data that drives charts, calculators, and comparison tools. Everything that needs to be processed in JavaScript.

**Trade-offs:** Data is bundled at build time (fast, no runtime loading) but requires a rebuild when data changes. Acceptable for a personal lab — data additions happen alongside content updates anyway.

**Example:**
```typescript
// src/data/batches/batch5.json
{
  "id": "batch5",
  "date": "2025-07-18",
  "meatWeightKg": 8.2,
  "totalCostEur": 240.71,
  "pieces": [
    { "index": 1, "grossG": 310, "netG": 297, "actualG": null }
  ],
  "spices": {
    "saltG": 110.5,
    "blackPepperG": 13.9,
    "corianderG": 47.3
  },
  "yieldPct": null
}

// In batch5.mdx
import batchData from '@site/src/data/batches/batch5.json';
import BatchSummaryCard from '@site/src/components/batch/BatchSummaryCard';
import PieceWeightTable from '@site/src/components/batch/PieceWeightTable';

<BatchSummaryCard batch={batchData} />

<PieceWeightTable pieces={batchData.pieces} hookWeightG={13} />
```

### Pattern 2: Aggregation Import for Cross-Batch Components

**What:** For components that show trends across all batches, create a barrel file `src/data/batches/index.ts` that imports and re-exports all batch JSONs as an array. Chart components import this array.

**When to use:** `BatchTrendChart`, `BatchCompare`, any tool that needs to reference multiple batches.

**Trade-offs:** Adding a new batch means touching `index.ts` (one line) — not a hidden maintenance burden.

**Example:**
```typescript
// src/data/batches/index.ts
import batch2 from './batch2.json';
import batch3 from './batch3.json';
import batch4 from './batch4.json';
import batch5 from './batch5.json';

export const allBatches = [batch2, batch3, batch4, batch5];
export type { BatchData } from '../types';

// In BatchTrendChart.tsx
import { allBatches } from '@site/src/data/batches';

export function BatchTrendChart() {
  const data = allBatches.map(b => ({
    name: b.id,
    yieldPct: b.yieldPct,
    costEur: b.totalCostEur,
  }));
  return <LineChart data={data} ... />;
}
```

### Pattern 3: Stateful Self-Contained Calculators

**What:** Calculator components own their own form state with `useState`. They read base formulas from JSON (spice ratios, constants) but do not depend on batch data. Output is computed entirely client-side.

**When to use:** `SpiceCalculator` (meat weight → spice quantities), `CostCalculator` (meat weight + prices → cost/kg).

**Trade-offs:** No state management library needed — `useState` is sufficient for single-screen form tools. Keeps calculators independently deployable on any page.

**Example:**
```typescript
// src/components/calculators/SpiceCalculator.tsx
import baseRecipe from '@site/src/data/recipes/biltong-base.json';

export function SpiceCalculator() {
  const [meatWeightKg, setMeatWeightKg] = useState(5);
  const scale = meatWeightKg / baseRecipe.baseMeatWeightKg;

  return (
    <div>
      <input type="number" value={meatWeightKg}
             onChange={e => setMeatWeightKg(Number(e.target.value))} />
      <table>
        {baseRecipe.spices.map(spice => (
          <tr key={spice.name}>
            <td>{spice.name}</td>
            <td>{(spice.baseG * scale).toFixed(1)}g</td>
          </tr>
        ))}
      </table>
    </div>
  );
}
```

### Pattern 4: MDX Rename for Interactive Pages

**What:** Pages that embed React components must use the `.mdx` extension (not `.md`). Docusaurus processes `.mdx` files through its MDX loader which enables JSX. Pure narrative-only pages can remain `.md`.

**When to use:** Any batch log page that will gain a chart or summary card; all calculator/tool pages.

**Trade-offs:** Minimal — renaming `.md` to `.mdx` has no effect on prose rendering. All frontmatter, slugs, and sidebar positions are preserved. Worth doing immediately for all batch log files to avoid a piecemeal rename during feature work.

## Data Flow

### Interactive Component Data Flow

```
src/data/batches/batch5.json   (build-time, on disk)
    ↓ ESM import
batch5.mdx (page)
    ↓ passes as prop
BatchSummaryCard / PieceWeightTable
    ↓ renders
Static HTML + hydrated React (in browser)
```

### Calculator Data Flow

```
src/data/recipes/biltong-base.json  (build-time constants)
    ↓ ESM import
SpiceCalculator.tsx
    ↑ user input (meat weight)
    ↓ computed output
Rendered table / result UI
    (all client-side, no server)
```

### Cross-Batch Chart Data Flow

```
src/data/batches/index.ts  (aggregates all batch JSONs)
    ↓ ESM import
BatchTrendChart.tsx
    ↓ maps to chart series
Recharts LineChart → SVG in browser
```

### Key Data Flows

1. **Batch data → page components:** JSON file imported directly in `.mdx`, passed as props to display components. Single-direction, no state.
2. **Recipe constants → calculators:** JSON imported at module level in calculator component. User input drives derived values via `useState`.
3. **All batches → trend charts:** Barrel import provides typed array; chart component maps it to series data.

## Scaling Considerations

This is a personal static site. Scaling concerns are about content volume, not user traffic.

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 5 batches (current) | JSON-as-module works perfectly. Bundle size is negligible. |
| 20-50 batches | Still fine as modules. Consider a `scripts/` folder with a Node script to auto-generate `index.ts` barrel from batch JSON files. |
| 100+ batches | At this volume, static import of all batch data on every page is wasteful. Migrate to `useEffect` + `fetch()` from `/static/data/` and lazy-load batch details. Not a near-term concern. |

### Scaling Priority

1. **First concern:** Batch data schema evolving across batches (e.g., batch 2 lacks fields batch 5 has). Handle with TypeScript optional fields (`actualG?: number | null`) from the start. Do not defer this.
2. **Second concern:** Calculator formulas changing. Keep formula constants in JSON, not hardcoded in components. Makes updates a data edit, not a code edit.

## Anti-Patterns

### Anti-Pattern 1: Data Embedded as JSX Props in MDX

**What people do:** Write batch data as object literals directly in the `.mdx` file and pass them inline to components.

**Why it's wrong:** Data is invisible to tooling, impossible to query across batches, and duplicated if you want a summary view. The batch log page becomes a maintenance nightmare mixing prose and data.

**Do this instead:** Structured data lives in `src/data/batches/batch5.json`. The MDX file imports it. Prose stays in markdown. Data stays in JSON.

### Anti-Pattern 2: Browser `fetch()` for Local Data

**What people do:** Put JSON files in `/static/`, then `fetch('/data/batch5.json')` inside a `useEffect`.

**Why it's wrong:** Adds async loading state, potential 404 errors, and network round-trips for data that is already available at build time. Complicates components with loading/error states.

**Do this instead:** Import JSON files as ES modules from `src/data/`. Webpack bundles them at build time. No network request, no loading state, no error handling needed.

**Exception:** If batch data eventually grows to 100+ entries and bundle size matters, switch to `fetch()` selectively for the trend chart page only — not for individual batch pages.

### Anti-Pattern 3: Frontmatter as Structured Data

**What people do:** Put all batch data (piece weights, spice quantities, costs) into YAML frontmatter to keep one file per batch.

**Why it's wrong:** Docusaurus frontmatter is not accessible in React components without custom plugins. Standard frontmatter fields (`title`, `sidebar_position`) work fine; arbitrary deep data does not flow to components. You'd need a custom Docusaurus plugin to expose it — significant complexity for no real benefit.

**Do this instead:** Frontmatter holds only what Docusaurus natively understands (`title`, `slug`, `sidebar_position`, `description`). Structured numeric data lives in the parallel JSON file. Both files are committed together.

### Anti-Pattern 4: One Monolithic `BatchDashboard` Component

**What people do:** Build a single large component that renders the summary card, piece table, AND charts for a batch.

**Why it's wrong:** Individual features (summary card vs. weight chart vs. comparison tool) will be added on different timelines. Monolithic component creates merge conflicts and makes it hard to use one piece without the others.

**Do this instead:** Decompose into `BatchSummaryCard`, `PieceWeightTable`, `BatchTrendChart` — each independently importable. Pages compose what they need.

### Anti-Pattern 5: Skipping TypeScript Interfaces for Batch Data

**What people do:** Work with JSON as `any` or inline object literals.

**Why it's wrong:** Each batch has slightly different fields (batch 2 has final weights; batch 5 doesn't yet). Without a typed interface, components silently receive undefined for missing fields and render blank data or throw runtime errors.

**Do this instead:** Define `BatchData` interface in `src/data/types.ts` with optional fields for data that may not exist. All components accept `BatchData` props and TypeScript catches shape mismatches at build time.

## Integration Points

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| JSON data files ↔ React components | ESM import (build-time) | JSON files must match `BatchData` TypeScript interface |
| MDX pages ↔ React components | JSX props | Pages are thin — they import data and pass to components, no logic |
| Calculators ↔ recipe JSON | ESM import (build-time) | Formulas are constants, not batch-specific data |
| Shared UI primitives ↔ domain components | React props | `DataTable` and `StatCard` have no domain knowledge |
| `src/` components ↔ `docs/` MDX | `@site/src/components/` alias import | Docusaurus `@site` alias resolves to project root |

### Build-Time Constraints (SSR Awareness)

Docusaurus server-side renders pages to static HTML during `pnpm build`. React components in MDX run in Node.js during this phase, then hydrate in the browser. Two rules follow from this:

1. **No `window` or `document` in module scope.** If a chart library accesses browser globals at import time, it will crash SSR. Wrap browser-only code in `useEffect` or use Docusaurus's `<BrowserOnly>` wrapper component.
2. **Recharts is SSR-safe** (renders to SVG, no browser globals at import time) — confirmed via package inspection. Victory and Chart.js have known SSR issues in Docusaurus; prefer Recharts.

## Suggested Build Order

Based on dependencies between layers:

1. **Data layer first** — Define `src/data/types.ts` and create JSON files for all existing batches (batch2–batch5). This is the foundation everything else consumes. Unblock all subsequent work.

2. **Shared UI primitives second** — Build `StatCard` and `DataTable` as generic, dumb components. These have zero dependencies and are needed by both batch display and calculators.

3. **Batch display components third** — `BatchSummaryCard` and `PieceWeightTable`. These are the highest-value, lowest-complexity components. Replacing markdown tables with these delivers immediate visible improvement and validates the data layer.

4. **Charts fourth** — `BatchTrendChart` requires all batch JSON files to exist (data layer) and a chart library decision. Adding Recharts and building trend charts is the first component with a new dependency.

5. **Calculators fifth** — `SpiceCalculator` and `CostCalculator` are self-contained. They need `biltong-base.json` (recipe constants) but nothing from the batch data layer. Can be built independently of charts.

6. **Comparison tool last** — `BatchCompare` requires the data layer, display components, and real-world validation of the data schema. Building it last lets earlier work surface any schema issues.

## Sources

- [MDX and React | Docusaurus](https://docusaurus.io/docs/markdown-features/react) — Component import patterns, `@site` alias, global scope registration (HIGH confidence)
- [Docusaurus Architecture | Docusaurus](https://docusaurus.io/docs/next/advanced/architecture) — SSR vs client-side rendering rules, JSON serialization constraints (HIGH confidence)
- [recharts/recharts | GitHub](https://github.com/recharts/recharts) — SSR compatibility, React/D3 integration (HIGH confidence)
- [Using Shadcn UI with Docusaurus](https://developers.onwardplatforms.com/blog/2025/01/29/using-shadcn-in-docusuarus) — Community pattern for component library integration in Docusaurus (MEDIUM confidence)
- [Docusaurus community: How to use aliases](https://github.com/facebook/docusaurus/discussions/10127) — `@site` alias and custom webpack alias patterns (MEDIUM confidence)

---
*Architecture research for: Noble Notations — interactive React components in Docusaurus 3.x*
*Researched: 2026-03-13*
