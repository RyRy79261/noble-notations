# Feature Research

**Domain:** Personal food knowledge base — batch logging, recipe calculators, fermentation tracking
**Researched:** 2026-03-13
**Confidence:** HIGH for table stakes (based on existing batch data patterns and established calculator conventions); MEDIUM for differentiators (based on ecosystem survey of comparable tools)

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features that any serious food experimentation log must have. Missing these makes the site feel like a rough draft rather than a reference tool.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Recipe scaling calculator | Every food site in this domain has one; manual scaling is error-prone and Ryan is already doing it by hand | MEDIUM | Input: meat weight in kg. Output: all spice/wash quantities. Must handle non-linear scaling (whole chilis, star anise) and user-applied adjustments (+10%/-20% on individual spices) |
| Structured batch data | Batch logs with inconsistent formatting feel incomplete; data in prose is hard to reference | MEDIUM | Requires migrating existing batch markdown to a consistent frontmatter/JSON schema. Blocker for every other data feature |
| Rendered data tables | Raw markdown tables for piece weights and cost breakdowns are hard to scan; sortable/interactive tables are the baseline expectation | LOW | Docusaurus MDX lets you drop a React component directly into batch pages; no separate data store needed initially |
| Cost per batch summary | Cost is already tracked in batch 5; not displaying it as a clear summary makes it easy to miss | LOW | Derive cost per kg (total cost / final yield weight). Requires final yield weight to be recorded |
| Drying progress tracker | Batch logs already include piece weights; showing actual vs expected dryness per piece is core value | MEDIUM | Table with gross/net/expected/actual columns, visual progress indicator. Batch 5 has the template — actual weights column is empty |
| Content navigation by domain | Site has biltong logs, recipe tinkering, and will add sourdough/fermentation/smoking — without clear navigation, content is unlocatable | LOW | Sidebar restructuring and landing pages per domain; structural work not component work |
| Consistent batch log schema | Batches 2-4 have inconsistent formats (batch 2 in Biltong.md, batch 4 missing cost table, batch 5 most complete). Users expect uniform structure | LOW | Define the schema, backfill earlier batches. Not a UI feature but a prerequisite for comparison and trend features |

### Differentiators (Competitive Advantage)

These are what make Noble Notations more than a personal wiki. They directly reflect the core value: "make better decisions for each new batch."

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Batch comparison tool | Side-by-side diff of spice ratios, wash quantities, yield %, and cost across any two batches shows what changed and what worked | HIGH | Requires structured data schema first. UI: two-column layout, highlight deltas. Most impactful single feature for repeat experimenters |
| Trend charts across batches | Visualize salt ratios, yield percentage, drying time, cost/kg over 5+ batches — turns anecdote into pattern | HIGH | Recharts or similar in a React component embedded via MDX. Requires clean cross-batch data. Blocked by structured schema |
| Spice ratio calculator with adjustments | Not just scaling from base weight, but applying named adjustments ("salt -10%", "coriander +coarse grind multiplier") that Ryan explicitly tracks | HIGH | More opinionated than generic calculators. Stores Ryan's accumulated knowledge as logic. Differentiates from a simple multiplier tool |
| Yield prediction model | Given piece sizes, predict expected yield per piece at 45% loss rate (already used in batch 5). Show running totals | MEDIUM | Inputs: gross weight per piece, hook weight. Outputs: expected dried weight, total batch yield. Could be per-batch component or standalone calculator |
| Substitution ledger | Batch 5 has detailed substitution notes — capture this as structured data (ingredient X replaced by Y at Z ratio) for future reference | MEDIUM | Structured data within batch logs. Enables a searchable substitution index across all batches |
| Cross-domain linking (biltong → curing → smoking) | Technique notes (equilibrium salt %, drying chamber setup) are shared across biltong, smoking, and curing — link them explicitly | LOW | Docusaurus has good cross-page linking; value is in the deliberate knowledge graph, not novel tech |
| Sourdough baker's percentage calculator | Standard in the sourdough community; hydration, starter %, levain, salt as % of flour. Well-understood inputs/outputs | MEDIUM | Standalone calculator page. Can be a self-contained React component. Numerous reference implementations to study |
| Fermentation timeline tracker | Log start date, expected duration, and milestone observations for kimchi/kombucha/sauerkraut per batch | MEDIUM | Structured front matter for fermentation logs, component to show elapsed time and progress. Static — no backend needed |

### Anti-Features (Commonly Requested, Often Problematic)

Features to deliberately not build.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| User accounts / community features | "Let others log their own batches" | Violates the static-only constraint; adds auth, database, and security surface area. This is a personal lab, not a platform | Shareable direct links to batch logs and calculators; GitHub-based contribution model for anyone who forks |
| Real-time sensor integration | Tilt hydrometers, Bluetooth thermometers, fermentation monitors exist and are popular | Requires backend infrastructure; the value is in the analysis, not the raw data collection. Out of scope per PROJECT.md | Manual observation log fields with structured frontmatter; analyze data after collection |
| Nutritional tracking (calories, macros) | Common request on food sites | Different domain — this is a fermentation/curing lab, not a meal planner. Nutrition data for cured meats is complex (water loss changes density) | Document yield percentage and final weight; leave nutrition to dedicated apps |
| AI-generated recipe suggestions | Trendy feature on food sites | Requires API calls and thus a backend or exposed API keys in static site. Adds maintenance burden. Also undermines the experimental, personal nature of the lab | The batch log history is the "AI" — trend analysis surfaces patterns without needing LLM calls |
| Mobile app | Tempting since Ryan makes biltong hands-on | Static site is already responsive. Native app is a separate project with its own deployment and maintenance surface | Ensure calculator pages are touch-friendly and work offline via service worker caching |
| Automated cost updates from live prices | Prices change; the dream is always-current cost estimates | Requires scraping or API integration with grocery suppliers; brittle and breaks silently. EUR prices vary by source (German vs Irish suppliers) | Store price-per-unit as editable constants in a config file; prompt Ryan to update when making a batch |

---

## Feature Dependencies

```
[Structured Batch Data Schema]
    └──required by──> [Batch Comparison Tool]
    └──required by──> [Trend Charts]
    └──required by──> [Substitution Ledger]
    └──required by──> [Drying Progress Tracker] (as interactive component)

[Recipe Scaling Calculator]
    └──enhances──> [Yield Prediction Model]
    └──standalone──> no upstream dependencies

[Drying Progress Tracker]
    └──requires──> [Actual weights recorded in batch logs]

[Trend Charts]
    └──requires──> [Structured Batch Data Schema]
    └──requires──> [≥3 batches with consistent fields] (already satisfied for biltong)

[Sourdough Calculator]
    └──standalone──> no upstream dependencies
    └──enhances──> [Cross-domain linking] (link from sourdough section)

[Fermentation Timeline Tracker]
    └──requires──> [Fermentation section created]
    └──standalone from biltong data──> separate schema per domain

[Batch Comparison Tool]
    └──requires──> [Structured Batch Data Schema]
    └──enhances──> [Trend Charts] (comparison drives questions, charts answer them)
```

### Dependency Notes

- **Structured Batch Data Schema is the critical path**: Every data-driven feature (comparison, trends, substitution ledger, interactive drying tracker) is blocked until batch data is migrated from prose markdown to a consistent, machine-readable format. This must be Phase 1 of any interactive features milestone.
- **Recipe Scaling Calculator is independent**: Can be built and shipped before any data migration work. High value, low dependency.
- **Sourdough and Fermentation sections are independent of biltong data**: They can be built in parallel with the biltong data migration or after it, without blocking each other.
- **Trend Charts require patience**: Biltong batches 2-5 exist, but batches 2-4 have inconsistent data. Backfilling those is prerequisite work, not optional polish.

---

## MVP Definition

This is an "interactive features" milestone on top of a working site. MVP here means: ship the highest-value interactive components first, validate they're useful before building the full data pipeline.

### Launch With (v1) — Interactive Core

- [ ] **Recipe scaling calculator** — Highest value, independent, immediately usable for next batch. Input: meat weight in kg. Output: all spice and wash quantities with Ryan's accumulated adjustments baked in.
- [ ] **Structured batch data schema** — Define the YAML frontmatter schema and migrate batch 5 (most complete). Gates everything else.
- [ ] **Interactive drying progress table** — Replace the static markdown table in batch logs with a React component that shows progress bars for each piece. Uses data already in batch 5.
- [ ] **Cost summary component** — Derived from the cost table already in batch 5. Cost per batch, cost per kg finished product.

### Add After Validation (v1.x)

- [ ] **Backfill batches 2-4 to schema** — Once schema is proven on batch 5, apply to earlier batches. Trigger: batch 6 needs to be logged in the new format.
- [ ] **Batch comparison tool** — Trigger: once 2+ batches are in structured format, comparison becomes meaningful.
- [ ] **Trend charts** — Trigger: 3+ batches in structured format.
- [ ] **Sourdough calculator** — Trigger: when sourdough content section is created.

### Future Consideration (v2+)

- [ ] **Fermentation timeline tracker** — Defer until fermentation section has real content to attach it to.
- [ ] **Substitution ledger / searchable index** — High value but low urgency; useful when batches accumulate more substitution history.
- [ ] **Yield prediction model with variance** — Useful once enough actual yield data is recorded to validate the 45% model.
- [ ] **Smoking/curing section calculators** — Equilibrium cure calculator (salt % by meat weight) belongs here. Defer until that section exists.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Structured batch data schema | HIGH | MEDIUM | P1 |
| Recipe scaling calculator | HIGH | MEDIUM | P1 |
| Interactive drying progress table | HIGH | LOW | P1 |
| Cost summary component | MEDIUM | LOW | P1 |
| Batch comparison tool | HIGH | HIGH | P2 |
| Trend charts | HIGH | HIGH | P2 |
| Sourdough baker's percentage calculator | MEDIUM | MEDIUM | P2 |
| Backfill batches 2-4 to schema | MEDIUM | MEDIUM | P2 |
| Fermentation timeline tracker | MEDIUM | MEDIUM | P3 |
| Substitution ledger | MEDIUM | HIGH | P3 |
| Yield prediction model with variance | LOW | HIGH | P3 |
| Smoking/curing section calculators | MEDIUM | MEDIUM | P3 |

**Priority key:**
- P1: Must have for this milestone
- P2: Should have, add when P1 is stable
- P3: Nice to have, future milestone

---

## Competitor Feature Analysis

Surveyed tools in the same domain space:

| Feature | Bespoke Biltong Spice Calc | EatCuredMeat Curing Calc | Sourdoughtalk.com Calc | Noble Notations Approach |
|---------|---------------------------|--------------------------|------------------------|--------------------------|
| Basic scaling (linear) | Yes (Calconic widget) | Yes | Yes | Yes — plus named adjustments |
| Named per-spice adjustments | No | No | No | Yes — Ryan's adjustments are first-class data |
| Substitution tracking | No | No | No | Yes — structured field in batch log schema |
| Batch comparison | No | No | No | Yes — cross-batch diff component |
| Trend visualization | No | No | No | Yes — Recharts embedded in MDX |
| Cost tracking | No | No | No | Yes — line-item breakdown per batch |
| Domain expansion (sourdough, fermentation) | No | No (curing only) | No (sourdough only) | Yes — multi-domain knowledge base |
| Drying progress per piece | No | No | No | Yes — per-piece progress table |

The differentiation is clear: no existing tool combines batch logging, spice calculators with opinionated adjustments, cost tracking, and trend visualization for the home food experimenter. Each existing tool is a single-purpose calculator. Noble Notations is the experimenter's full lab notebook.

---

## Sources

- [Bespoke Biltong Spice Calculator](https://bespokebiltong.com/pages/spice-calculator) — reference for what a dedicated biltong spice tool offers (limited to basic scaling)
- [EatCuredMeat Meat Curing Calculator](https://eatcuredmeat.com/calculator/meat-curing-salt-calculator/) — equilibrium curing calculator conventions; inputs/outputs for salt % by meat weight
- [EQ Dry Cure Calculator (digging-dog.vercel.app)](https://digging-dog.vercel.app/) — modern static-site implementation of curing calculator; confirms client-side approach is viable
- [Sourdough Calculator conventions (sourdoughcalculator.info)](https://sourdoughcalculator.info/) — baker's percentage inputs, hydration model, starter % conventions
- [Docusaurus MDX + Recharts pattern](https://embeddable.com/blog/react-chart-libraries) — confirmed: Recharts embeds cleanly in Docusaurus MDX pages
- [Ekos batch fermentation history feature](https://www.goekos.com/blog/new-ekos-feature-fermentation-history/) — professional fermentation batch history as reference for what cross-batch comparison delivers
- Noble Notations batch logs (batches 2-5) — primary source for understanding what data already exists and what schema design must preserve

---

*Feature research for: Noble Notations — interactive food knowledge base*
*Researched: 2026-03-13*
