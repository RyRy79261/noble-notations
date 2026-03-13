# Project Research Summary

**Project:** Noble Notations
**Domain:** Interactive food knowledge base — batch logging, spice calculators, fermentation tracking (Docusaurus 3.x static site)
**Researched:** 2026-03-13
**Confidence:** HIGH

## Executive Summary

Noble Notations is a personal food experimentation lab built on Docusaurus 3.x. The project already has a working static site with 5 biltong batches logged in inconsistent formats. The interactive features milestone is about adding React components (calculators, charts, comparison tools) that turn the existing prose logs into a queryable, visual knowledge base. Research shows the established pattern for this type of site is JSON-as-module data files imported directly into MDX pages, React components receiving data via props, and Recharts for visualization — all client-side, no backend. This approach is well-documented and fits the static-only constraint exactly.

The recommended approach is to treat the structured batch data schema as the critical-path deliverable. Every high-value interactive feature (batch comparison, trend charts, drying progress tracker) depends on machine-readable data. The recipe scaling calculator is the only high-value feature that is fully independent and should be built first to deliver immediate value while the data migration proceeds. The architecture is deliberately simple: typed JSON files, composable React components, and a strict separation between data (`src/data/`), display components (`src/components/`), and content pages (`docs/`).

The primary risk is the SSR/SSG constraint: Docusaurus renders pages at build time in Node.js, where browser APIs (`window`, `document`) do not exist. Any chart component that accesses these at module scope will crash the production build even if it runs fine in development. The mitigation is established and non-negotiable: every chart component must use Docusaurus's `<BrowserOnly>` wrapper with `require()` inside the render callback. This pattern must be established before the first chart component is written, not retrofitted after a build failure.

## Key Findings

### Recommended Stack

The project's existing foundation — Docusaurus 3.5.2, React 18, TypeScript, pnpm — is the correct base with one upgrade needed: Docusaurus 3.9.x requires Node.js 20+, and the current `engines` field specifies `>=18.0`. This upgrade should happen first, before adding any interactive components, because Docusaurus 3.9 includes Rspack for faster builds which matters during component development iteration.

For visualization, Recharts 3.8.x is the clear recommendation: 7M+ weekly downloads, composable SVG-first React API, and it avoids the DOM manipulation conflicts that come with direct D3 use. For calculator forms with 5+ fields or validation, `react-hook-form` ^7.54.x adds uncontrolled-by-default inputs with built-in validation. Simple calculators (1-3 inputs) need nothing beyond plain `useState`. CSS Modules (`.module.css`) handle component-scoped styles without conflicting with Docusaurus's Infima CSS variable system — do not add Tailwind.

**Core technologies:**
- Docusaurus 3.9.x: Site framework — upgrade from 3.5.2 unlocks Rspack builds; requires Node 20
- React 18.3.x: Already present — fully compatible with all recommended libraries
- Recharts 3.8.x: Data visualization — React-native SVG API, BrowserOnly pattern required
- TypeScript ~5.5.x: Already present — define `BatchData` interface in `src/data/types.ts` immediately
- react-hook-form ^7.54.x: Calculator forms — use for 5+ field calculators with validation
- CSS Modules: Component styles — built into Docusaurus, no conflicts with Infima

### Expected Features

The existing batch logs (batches 2-5) already contain the raw material for every P1 feature. Batch 5 is the most complete reference and should anchor the schema definition. The feature dependency tree is clear: the structured data schema is the root node that unlocks everything except the standalone recipe calculator.

**Must have (table stakes):**
- Structured batch data schema — machine-readable JSON per batch; blocker for all data-driven features
- Recipe scaling calculator — independent, immediately useful for the next batch; no upstream dependencies
- Interactive drying progress table — replaces static markdown table in batch logs; batch 5 has the template
- Cost summary component — derived from data already in batch 5; cost per batch and per kg finished product
- Content navigation by domain — sidebar restructuring before adding sourdough/fermentation sections

**Should have (differentiators):**
- Batch comparison tool — side-by-side diff of spice ratios, yield %, cost across any two batches; needs 2+ batches in schema
- Trend charts across batches — yield %, cost/kg, drying days over time; needs 3+ batches in schema
- Backfill batches 2-4 to schema — prerequisite for comparison and trend features; batch 6 is the forcing function
- Sourdough baker's percentage calculator — standalone, no dependency on biltong data; build when sourdough section is created

**Defer (v2+):**
- Fermentation timeline tracker — needs real fermentation content to attach to; build when that section exists
- Substitution ledger / searchable index — valuable when more substitution history accumulates across batches
- Yield prediction model with variance — meaningful only when enough actual yield data validates the 45% model
- Smoking/curing section calculators — equilibrium cure calculator; defer until that content section exists

### Architecture Approach

The architecture is a three-layer stack with strict directional data flow: JSON data files in `src/data/` are imported as ES modules into React components in `src/components/`, which are composed into MDX pages in `docs/`. No data flows upward; no component fetches data at runtime. This makes the entire site statically analyzable, TypeScript-checkable at build time, and free of network loading states. The `@site/` Docusaurus alias handles cross-directory imports cleanly.

**Major components:**
1. `BatchSummaryCard` — at-a-glance stats for one batch; pure display, driven entirely by props from JSON
2. `PieceWeightTable` — sortable piece-weight breakdown; wraps existing markdown table pattern
3. `BatchTrendChart` — cross-batch line/bar charts via Recharts; requires `<BrowserOnly>` wrapper
4. `SpiceCalculator` — stateful form component; reads base ratios from `src/data/recipes/biltong-base.json`
5. `BatchCompare` — side-by-side diff of two batch objects; highest complexity, build last
6. Shared UI primitives (`DataTable`, `StatCard`) — generic, domain-free, reused across all other components

The build order that research recommends: data layer (types + JSON files) → shared UI primitives → batch display components → charts → calculators → comparison tool. This order respects all dependency relationships and surfaces schema issues early, before they are embedded in multiple consuming components.

### Critical Pitfalls

1. **Browser API access during SSG build ("window is not defined")** — Every chart and browser-dependent component must use Docusaurus's `<BrowserOnly>` wrapper with `require()` inside the render callback, not a top-level `import`. Establish this pattern before writing the first chart component. The symptom: works in `pnpm start`, crashes `pnpm build` or GitHub Pages CI.

2. **No single source of truth for batch data** — Batch data must live in `src/data/batches/` JSON files, not inline in MDX props or markdown tables. Hardcoding even one batch's data in a component creates a divergence problem that compounds with every new batch. Define the schema and JSON files before building any data-consuming component.

3. **Swizzling unsafe Docusaurus components** — Prefer `swizzle --wrap` over `--eject`; prefer CSS custom properties (`--ifm-*` Infima variables) over swizzling for visual changes. Ejected components silently diverge from Docusaurus internals on minor version upgrades and require manual forward-porting.

4. **MDX v3 strict JSX syntax** — Curly braces, angle brackets (`<180°C`), and unclosed HTML tags in batch log files will fail `pnpm build` even though `pnpm start` tolerates them. Escape `{` as `\{`, use `<br />` not `<br>`, use markdown links not `<url>` autolinks. Add remark-lint pre-commit.

5. **Light/dark mode color gaps** — Every CSS variable defined in `:root {}` needs a `[data-theme='dark'] {}` counterpart. Chart colors must use CSS custom properties, not hardcoded hex strings. Recharts chart colors defined as hex constants become invisible in dark mode.

## Implications for Roadmap

Based on research, the dependency structure and pitfall-to-phase mapping suggest five phases:

### Phase 1: Foundation and Environment
**Rationale:** Three setup tasks must complete before any feature work: Node.js 20 upgrade (unblocks Docusaurus 3.9), `<BrowserOnly>` pattern establishment (prevents SSR build crashes), and batch data schema definition (the root dependency for all data-driven features). None of these deliver visible features, but all of them gate everything else. Doing them first rather than deferring eliminates the most expensive pitfalls.
**Delivers:** Node 20 + Docusaurus 3.9 upgrade, TypeScript `BatchData` interface, `src/data/batches/batch5.json` (pilot), `<BrowserOnly>` wrapper established as project pattern, `.mdx` extension applied to interactive pages, remark-lint in CI, CNAME in `static/`
**Addresses:** Pitfalls 1, 2, 4, and the CNAME loss risk
**Avoids:** Retrofitting BrowserOnly; data divergence from the start

### Phase 2: Recipe Scaling Calculator
**Rationale:** The recipe scaling calculator is the only high-value feature with no upstream dependencies on the data schema. It can be built and shipped while Phase 3 backfilling work proceeds. It delivers immediate utility for the next batch and validates the calculator component pattern and form handling approach before building more complex calculators.
**Delivers:** `SpiceCalculator` component with Ryan's named adjustments baked in, `src/data/recipes/biltong-base.json`, a standalone calculator page, mobile-responsive layout, input validation via react-hook-form
**Uses:** react-hook-form, CSS Modules, Pattern 3 (stateful self-contained calculators) from ARCHITECTURE.md
**Avoids:** Pitfall 5 (dark mode) — establish CSS variable approach here

### Phase 3: Batch Data Layer and Display Components
**Rationale:** With the schema proven on batch 5 in Phase 1, this phase backfills batches 2-4 and builds the display components that consume them. These components (BatchSummaryCard, PieceWeightTable, cost summary) deliver the highest visible improvement per effort: replacing static markdown tables with interactive, sortable, structured views. Completing this phase makes every subsequent data-driven feature unblocked.
**Delivers:** batch2-4.json backfilled, `BatchSummaryCard`, `PieceWeightTable`, cost summary component, shared `DataTable` and `StatCard` UI primitives
**Implements:** Patterns 1 and 4 from ARCHITECTURE.md (JSON-as-module, MDX rename)
**Avoids:** Pitfall 3 (data in markdown) — all numeric data exits markdown tables into JSON

### Phase 4: Trend Charts and Batch Comparison
**Rationale:** With all batch JSON files in place and the data schema validated across 4 batches, trend charts and the comparison tool are unblocked. These are the highest-complexity features (HIGH implementation cost in FEATURES.md) and the strongest differentiators — no existing biltong tool does cross-batch analysis. Recharts integration here is where SSR pitfall prevention gets its first real test under production build conditions.
**Delivers:** `BatchTrendChart` (yield %, cost/kg, drying days over time), `BatchCompare` (side-by-side diff with delta highlighting), trend and comparison MDX pages
**Uses:** Recharts 3.8.x inside `<BrowserOnly>`, aggregation barrel file (`src/data/batches/index.ts`), Pattern 2 from ARCHITECTURE.md
**Avoids:** Pitfall 1 (SSR crash) — BrowserOnly pattern from Phase 1 applies here

### Phase 5: Domain Expansion (Sourdough and Fermentation)
**Rationale:** The sourdough calculator and fermentation section are independent of biltong data entirely. They belong in a separate phase so domain expansion doesn't block or interleave with biltong feature completion. By this phase the component patterns are proven; sourdough and fermentation content sections simply apply established patterns to a new domain.
**Delivers:** Sourdough baker's percentage calculator, fermentation section structure, sidebar navigation for multi-domain content, cross-domain linking between technique articles
**Avoids:** Adding content without navigation structure (Pitfall: "user cannot find sourdough content")

### Phase Ordering Rationale

- The data schema (Phase 1/3) is the explicit dependency root identified in FEATURES.md: "Structured Batch Data Schema is the critical path"
- The recipe calculator (Phase 2) is the only P1 feature that runs in parallel with data migration — shipping it early avoids a dead stop while backfilling proceeds
- Charts and comparison (Phase 4) require all batch JSON files to exist and the schema to be validated in real components — building them before Phase 3 guarantees rework
- Domain expansion (Phase 5) is explicitly deferred in FEATURES.md: "Defer until fermentation section has real content"
- The BrowserOnly pattern must precede any chart component — it is not retrofittable without risk of shipping a broken production build

### Research Flags

Phases with standard, well-documented patterns (additional research-phase not needed):
- **Phase 1:** Node upgrade, Docusaurus 3.9 upgrade, BrowserOnly pattern — all covered in official docs with specific version notes
- **Phase 2:** Recipe calculator form pattern — react-hook-form is well-documented; calculator formula logic is domain knowledge Ryan already has
- **Phase 3:** JSON data layer and display components — pure pattern application, no novel integrations

Phases that may benefit from deeper research during planning:
- **Phase 4:** Recharts SSR in production Docusaurus 3.9 — the SSR compatibility note in ARCHITECTURE.md says "confirmed via package inspection" at MEDIUM confidence; verify with a minimal build test before writing the full chart component suite
- **Phase 5:** Fermentation timeline tracker implementation — MEDIUM confidence on this feature; "tracker" implies time-based logic that has edge cases (timezone, elapsed time on static site) worth prototyping before committing to a schema

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Core stack verified against official Docusaurus, Recharts, and react-hook-form docs; SSR pattern confirmed via official Docusaurus SSG guide |
| Features | HIGH (P1/P2), MEDIUM (P3) | P1/P2 features grounded in existing batch data; P3 features (fermentation tracker, substitution ledger) have fewer reference implementations |
| Architecture | HIGH (patterns), MEDIUM (data layer) | MDX/component patterns are from official docs; no official Docusaurus guide for data-loading beyond plugins — confirmed via community patterns |
| Pitfalls | HIGH (SSR, swizzling, MDX syntax), MEDIUM (chart lib specifics) | SSR and swizzling pitfalls sourced from official Docusaurus docs and verified GitHub issues; chart-specific SSR behavior noted as MEDIUM in PITFALLS.md |

**Overall confidence:** HIGH — the technology choices are conventional, the patterns are established, and the feature scope is grounded in data that already exists in the repository.

### Gaps to Address

- **Recharts 3.x SSR in Docusaurus 3.9 production build:** STACK.md notes Recharts SSR issues via a GitHub issue thread (MEDIUM confidence). Before committing to the full chart component suite in Phase 4, build a minimal `BatchTrendChart` prototype and run `pnpm build` to confirm no SSR crash. This is a 30-minute validation step, not a research gap — but it must happen before Phase 4 scope is finalized.
- **Batch 2 and 3 data completeness:** FEATURES.md flags batches 2-4 as having inconsistent formats. Batch 2 is in `Biltong.md` (not a standalone page); batch 4 is missing the cost table. The actual extent of data gaps in those batches will only be known when the backfill work begins in Phase 3. The TypeScript optional fields approach (`actualG?: number | null`) handles this at the type level, but the schema design should be reviewed against actual batch 2-4 content before finalizing.
- **Non-linear spice scaling:** FEATURES.md notes the calculator "must handle non-linear scaling (whole chilis, star anise) and user-applied adjustments." The exact scaling rules for non-linear ingredients are domain knowledge in Ryan's head, not captured in research. The `biltong-base.json` schema design must accommodate a "scaling type" field per ingredient (linear vs. fixed vs. stepped) — this should be addressed explicitly during Phase 2 planning.

## Sources

### Primary (HIGH confidence)
- [Docusaurus SSG docs — BrowserOnly pattern](https://docusaurus.io/docs/advanced/ssg)
- [Docusaurus MDX and React docs — component import/registration patterns](https://docusaurus.io/docs/markdown-features/react)
- [Docusaurus Swizzling guide — safety levels, wrapping vs ejecting](https://docusaurus.io/docs/swizzling)
- [Docusaurus Styling and Layout — Infima variables, dark mode CSS](https://docusaurus.io/docs/styling-layout)
- [Docusaurus 3.9 release notes — Node 20 requirement, Rspack 1.5](https://docusaurus.io/blog/releases/3.9)
- [Recharts GitHub releases — 3.8.0 latest stable](https://github.com/recharts/recharts/releases)
- [Recharts 3.0 migration guide](https://github.com/recharts/recharts/wiki/3.0-migration-guide)
- [react-hook-form official site](https://react-hook-form.com/)
- Noble Notations batch logs (batches 2-5) — primary source for feature scope and data schema design

### Secondary (MEDIUM confidence)
- [Recharts SSR issues — document is not defined](https://github.com/recharts/recharts/issues/39)
- [GitHub issue #9884 — Hydration failed / React error #418](https://github.com/facebook/docusaurus/issues/9884)
- [GitHub issue #3889 — Deploying to GitHub Pages removes custom domain](https://github.com/facebook/docusaurus/issues/3889)
- [Ekos batch fermentation history feature](https://www.goekos.com/blog/new-ekos-feature-fermentation-history/) — cross-batch comparison reference
- [Using Shadcn UI with Docusaurus — community component integration pattern](https://developers.onwardplatforms.com/blog/2025/01/29/using-shadcn-in-docusuarus)

### Tertiary (LOW confidence)
- [Best React chart libraries 2025 — LogRocket](https://blog.logrocket.com/best-react-chart-libraries-2025/) — editorial survey; used only to confirm Recharts market position

---
*Research completed: 2026-03-13*
*Ready for roadmap: yes*
