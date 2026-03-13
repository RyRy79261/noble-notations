# Roadmap: Noble Notations

## Overview

Four phases turn the existing static batch logs into a visual, interactive food knowledge base. The first phase establishes the site's visual identity and navigation structure — work that is independent of data and pays dividends across all future content. The second phase migrates batch data from prose markdown into a typed, importable JSON schema — the root dependency that every chart and comparison tool requires. The third phase builds the calculators (scaling, cost, sourdough) which are mostly independent of the batch data migration and deliver immediate utility for the next batch. The fourth phase closes the loop: with all batch JSON files in place, trend charts and batch comparison tools are built on top of them.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Site Identity and Navigation** - Custom visual theme, responsive layout, and multi-domain sidebar structure
- [ ] **Phase 2: Batch Data Infrastructure** - TypeScript schema, JSON migration of batches 2-5, importable data layer
- [ ] **Phase 3: Calculators** - Recipe scaling, cost breakdown, and sourdough baker's percentage calculators
- [ ] **Phase 4: Data Visualization** - Interactive batch tables, side-by-side comparison, and cross-batch trend charts

## Phase Details

### Phase 1: Site Identity and Navigation
**Goal**: The site has a distinct visual identity and a navigation structure that supports multiple food domains
**Depends on**: Nothing (first phase)
**Requirements**: STYLE-01, STYLE-02, STYLE-03, NAV-01, NAV-02
**Success Criteria** (what must be TRUE):
  1. Site no longer shows stock Docusaurus green — custom color palette and typography are applied globally
  2. Site is readable and usable on a phone screen without horizontal scrolling
  3. Homepage communicates what the site is, shows the active domains, and links to key content
  4. Sidebar groups content by domain (biltong, sourdough, fermentation, smoking/curing) rather than a flat file list
  5. Each food domain has a landing page with summary stats and links to batch logs or recipes
**Plans**: TBD

### Phase 2: Batch Data Infrastructure
**Goal**: All batch data lives in typed, importable JSON files that React components can consume at build time
**Depends on**: Phase 1
**Requirements**: DATA-01, DATA-02, DATA-03
**Success Criteria** (what must be TRUE):
  1. A TypeScript `BatchData` interface exists and describes piece weights, spice ratios, costs, dates, and image references
  2. Batches 2-5 each have a JSON file in `src/data/batches/` that conforms to the schema
  3. A React component on a batch log page successfully imports and renders data from a JSON file without crashing the production build
**Plans**: TBD

### Phase 3: Calculators
**Goal**: Users can calculate exact spice quantities, batch costs, and sourdough ingredient amounts from a single weight input
**Depends on**: Phase 1
**Requirements**: CALC-01, CALC-02, CALC-03
**Success Criteria** (what must be TRUE):
  1. User enters a meat weight and receives exact quantities for every spice and wash ingredient, scaled from the base recipe
  2. User sees cost per batch and cost per kg of finished product, derived from current ingredient prices
  3. User enters a flour weight and receives baker's percentage quantities for a sourdough recipe
  4. All calculators work correctly on mobile and remain usable without a keyboard (touch-friendly inputs)
**Plans**: TBD

### Phase 4: Data Visualization
**Goal**: Batch log pages display structured interactive tables and users can compare batches and see trends across all batches
**Depends on**: Phase 2
**Requirements**: VIZ-01, VIZ-02, VIZ-03
**Success Criteria** (what must be TRUE):
  1. Batch log pages show a sortable piece weight and drying progress table instead of a static markdown table
  2. User can select any two batches and see a side-by-side comparison of spice ratios, yield percentages, and cost
  3. A trend chart page displays yield %, cost per kg, and drying days across all batches as a line or bar chart
  4. Charts render correctly in production build (no "window is not defined" SSR crash on GitHub Pages)
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Site Identity and Navigation | 0/TBD | Not started | - |
| 2. Batch Data Infrastructure | 0/TBD | Not started | - |
| 3. Calculators | 0/TBD | Not started | - |
| 4. Data Visualization | 0/TBD | Not started | - |

---
*Roadmap created: 2026-03-13*
