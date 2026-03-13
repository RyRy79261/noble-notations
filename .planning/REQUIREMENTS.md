# Requirements: Noble Notations

**Defined:** 2026-03-13
**Core Value:** Batch logs and recipe data are beautifully presented with interactive tools so Ryan can make better decisions for each new batch and share what he's learned.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Styling & Identity

- [ ] **STYLE-01**: Site has a custom color palette and typography that replaces stock Docusaurus green theme
- [ ] **STYLE-02**: Layout is responsive and usable on mobile and tablet devices
- [ ] **STYLE-03**: Custom homepage showcases the project with domain sections and key stats

### Data Infrastructure

- [ ] **DATA-01**: Structured TypeScript batch data schema defines piece weights, spice ratios, costs, dates, and image references
- [ ] **DATA-02**: Batches 2-5 are converted to structured JSON files conforming to the schema
- [ ] **DATA-03**: Batch data JSON files are importable by React components for client-side processing

### Calculators

- [ ] **CALC-01**: User can input meat weight and get exact spice and wash quantities scaled from base recipe ratios
- [ ] **CALC-02**: User can see cost breakdown per batch and cost per kg of finished product
- [ ] **CALC-03**: User can calculate sourdough recipes using baker's percentages (flour weight as base)

### Data Visualization

- [ ] **VIZ-01**: Batch log pages display sortable, interactive piece weight and drying progress tables
- [ ] **VIZ-02**: User can compare any two batches side-by-side showing spice ratios, yield percentages, and costs
- [ ] **VIZ-03**: Trend charts display yield %, cost per kg, and drying days across all batches

### Content Organization

- [ ] **NAV-01**: Sidebar navigation is restructured for multi-domain content (biltong, sourdough, fermentation, smoking/curing)
- [ ] **NAV-02**: Each food domain has a landing page summarizing key stats, recent batches, and links to logs

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Fermentation

- **FERM-01**: Fermentation timeline tracker with pH, temperature, and taste observations
- **FERM-02**: Fermentation batch log templates

### Smoking/Curing

- **SMOKE-01**: Smoking/curing batch log templates with temperature and time tracking
- **SMOKE-02**: Wood/fuel type reference guide

### Advanced Tools

- **TOOL-01**: Ingredient alternative suggestion engine
- **TOOL-02**: Shopping list generator from selected recipes
- **TOOL-03**: Batch photo gallery with measurement annotations

## Out of Scope

| Feature | Reason |
|---------|--------|
| Backend/database | Static site constraint — all data in markdown/JSON |
| User accounts | Personal site, no auth needed |
| Mobile app | Web-first, responsive is sufficient |
| E-commerce | Purely knowledge sharing |
| Real-time collaboration | Single author, open-source read-only |
| Tailwind CSS | Conflicts with Docusaurus Infima CSS system |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| STYLE-01 | Phase 1 | Pending |
| STYLE-02 | Phase 1 | Pending |
| STYLE-03 | Phase 1 | Pending |
| NAV-01 | Phase 1 | Pending |
| NAV-02 | Phase 1 | Pending |
| DATA-01 | Phase 2 | Pending |
| DATA-02 | Phase 2 | Pending |
| DATA-03 | Phase 2 | Pending |
| CALC-01 | Phase 3 | Pending |
| CALC-02 | Phase 3 | Pending |
| CALC-03 | Phase 3 | Pending |
| VIZ-01 | Phase 4 | Pending |
| VIZ-02 | Phase 4 | Pending |
| VIZ-03 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 14 total
- Mapped to phases: 14
- Unmapped: 0

---
*Requirements defined: 2026-03-13*
*Last updated: 2026-03-13 after roadmap creation — all requirements mapped*
