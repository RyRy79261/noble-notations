# Noble Notations

## What This Is

A personal, open-source food knowledge base and experimentation lab. Built on Docusaurus, it tracks biltong batch logs with detailed spice ratios, weights, costs, and drying observations — and is expanding to cover sourdough, fermentation, smoking/curing, and general recipes. The site serves as both a personal reference tool and a shareable resource for food experimenters.

## Core Value

Batch logs and recipe data are beautifully presented with interactive tools (calculators, comparisons, trend charts) so Ryan can make better decisions for each new batch and share what he's learned.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- Biltong recipe documentation with spice calculations and scaling notes
- Biltong batch logs (batches 2-5) with weights, costs, and observations
- Recipe tinkering section for experimental work
- Docusaurus static site with auto-generated sidebar navigation
- Deployed at noble-notations.ryanjnoble.dev

### Active

<!-- Current scope. Building toward these. -->

- [ ] Distinct visual identity — move beyond stock Docusaurus look
- [ ] Improved navigation and content discoverability
- [ ] Data visualization for batch logs (charts, structured tables)
- [ ] Batch comparison tools (side-by-side diffs of spice ratios, outcomes)
- [ ] Trend analysis across batches (salt ratios, drying times, yields, costs)
- [ ] Recipe scaling calculator (input meat weight, get exact quantities)
- [ ] Cost calculator (ingredient costs per batch, cost per kg finished product)
- [ ] Sourdough calculator integration
- [ ] Fermentation tracking section (kimchi, kombucha, sauerkraut)
- [ ] Smoking/curing section (beyond biltong)
- [ ] General recipe section

### Out of Scope

- Backend/database — static site only, all data lives in markdown/JSON
- User accounts or authentication — this is a personal site
- Mobile app — web-first, responsive is sufficient
- E-commerce or selling — purely knowledge sharing

## Context

- Site currently has 5 biltong batches logged with increasing detail and structure
- Batch logs contain rich data: piece weights, spice quantities, cost breakdowns, drying observations
- Spice ratios are manually calculated with scaling factors — prime candidate for automation
- Ryan is based in Europe (prices in EUR, ingredients sourced from German/Irish suppliers)
- Current styling is stock Docusaurus with green primary color (#2e8555)
- Content is markdown-heavy with manual tables — needs interactive components
- Deployed via GitHub Pages

## Constraints

- **Framework**: Docusaurus 3.x — not switching frameworks, build on what's there
- **Static only**: No server-side runtime; calculators and visualizations must be client-side React components
- **Continual experiment**: Site evolves incrementally; no big-bang redesign needed
- **Package manager**: pnpm

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Stay on Docusaurus | Already working, content is established, React components can add interactivity | -- Pending |
| Client-side calculators | No backend needed, keeps deployment simple (GitHub Pages) | -- Pending |
| Structured data in frontmatter/JSON | Enables programmatic access to batch data for charts and comparisons | -- Pending |

---
*Last updated: 2026-03-13 after initialization*
