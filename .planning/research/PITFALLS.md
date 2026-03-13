# Pitfalls Research

**Domain:** Interactive Docusaurus documentation site with React components, data visualization, and custom theming
**Researched:** 2026-03-13
**Confidence:** HIGH (Docusaurus SSR/SSG pitfalls), MEDIUM (chart library specifics, data architecture patterns)

---

## Critical Pitfalls

### Pitfall 1: Browser API Access During SSG Build ("window is not defined")

**What goes wrong:**
Docusaurus compiles components twice — once server-side (Node.js, no `window`, `document`, or `localStorage`) and once client-side. Any chart library (Recharts, Chart.js, Victory) or calculator component that references `window`, `document`, or `localStorage` at module or render scope will crash the entire build with `ReferenceError: window is not defined`. The site builds locally but explodes in CI/GitHub Pages deployment.

**Why it happens:**
Developers write React components the same way they would in a CRA/Vite app, forgetting Docusaurus does SSG first. Chart libraries like Recharts have known SSR issues where they access `document` internally on import. The naive guard `if (typeof window !== 'undefined')` causes a second problem: if used in render logic it produces divergent SSR vs. CSR DOM, triggering React hydration errors.

**How to avoid:**
Wrap all chart and browser-dependent components with Docusaurus's `<BrowserOnly>` component using the function-child pattern:

```jsx
import BrowserOnly from '@docusaurus/BrowserOnly';

<BrowserOnly fallback={<div>Loading chart...</div>}>
  {() => {
    const { BatchChart } = require('./BatchChart');
    return <BatchChart data={data} />;
  }}
</BrowserOnly>
```

Use `useIsBrowser()` hook for conditional logic that does not change the DOM structure. Use `useEffect()` for any side effects. Never use `typeof window !== 'undefined'` in render return paths.

**Warning signs:**
- Build error: `ReferenceError: window is not defined` in CI but not `pnpm start`
- React error #418: "Hydration failed because the initial UI does not match" after deployment
- Charts appear in dev mode but the production build fails or shows blank

**Phase to address:**
Phase introducing chart/visualization components. Establish the `<BrowserOnly>` wrapper pattern before writing any chart component.

---

### Pitfall 2: Swizzling Unsafe Components Creates Upgrade Debt

**What goes wrong:**
Docusaurus's `swizzle --eject` on "Unsafe" components copies the internal implementation into the project. When Docusaurus upgrades (even minor versions), those internal components change — props rename, internal modules move, or the component is split. The ejected copy silently diverges, causing visual regressions, TypeScript compilation errors (e.g., `@docusaurus/theme-common/internal` path changes), or subtle layout breaks.

**Why it happens:**
Ejecting looks like the obvious path to customize navigation or layout. The `--danger` flag warning is easy to dismiss. The component works fine at ejection time. The maintenance cost only materializes weeks or months later during upgrades.

**How to avoid:**
Use `swizzle --wrap` (no `--danger` required) for any component where you need to add behaviour around or inject into an existing component. Only eject when wrapping is genuinely insufficient (e.g., restructuring internal JSX). When you must eject, limit scope to the smallest possible component — swizzling a large layout component is far more dangerous than swizzling a small leaf component. Maintain a project list of all swizzled components and their safety levels.

For visual identity changes, exhaust CSS custom properties (Infima variables in `custom.css`) and `[data-theme='dark']` selectors before touching any swizzle.

**Warning signs:**
- TypeScript errors referencing `@docusaurus/theme-common/internal` after a version bump
- Navbar or footer renders differently after `pnpm update`
- The swizzled component has a significantly newer version in `node_modules` than your copy

**Phase to address:**
Theme customization phase. Audit all swizzle decisions at the start; prefer CSS-first for visual identity.

---

### Pitfall 3: Hardcoding Batch Data in Markdown Instead of a Single Source of Truth

**What goes wrong:**
Calculator and chart components receive data copy-pasted inline from markdown tables. When batch 6 is added, or a historical weight is corrected, the markdown table, the component props, and any comparison view all need updating separately. They drift. Charts show stale data. Calculations produce wrong outputs.

**Why it happens:**
The incremental "I'll just add a prop" approach feels natural for the first component. It breaks down as soon as a second component references the same batch data. This project already has this risk: batch data currently lives in manually-maintained markdown tables.

**How to avoid:**
Define a canonical data schema once, in a single location. Two viable approaches for a static Docusaurus site:

1. **JSON files in `src/data/`** — import directly into React components as ES modules. Clean separation, type-safe with TypeScript interfaces, no build plugins needed.
2. **Frontmatter as source of truth** — define structured frontmatter per batch document and use a custom plugin or `useDocsData()` to aggregate at build time.

For this project, JSON in `src/data/` is simpler and does not require plugin authorship. Components import from `../../data/batches.json`. The markdown pages can reference the same data via MDX component imports.

**Warning signs:**
- A batch weight or spice ratio appears correctly in one view but incorrectly in another
- Adding a new batch requires changes in 3+ files
- Calculator props are defined with numeric literals, not references

**Phase to address:**
Data architecture phase (should precede all interactive component work). Establish the schema and file location before building the first calculator.

---

### Pitfall 4: MDX v3 Strict JSX Syntax Breaks Existing Markdown

**What goes wrong:**
Docusaurus 3 uses MDX v3, which enforces strict JSX parsing. Markdown files that previously rendered fine now fail to build if they contain: bare HTML tags like `<br>`, angle-bracket-wrapped URLs (`<https://example.com>`), `{` or `}` characters used literally (e.g., in spice ratio formulas), or improperly closed JSX elements. The site was already on Docusaurus 3.5.2, so the initial migration risk has passed — but the risk re-emerges every time a new markdown file is authored.

**Why it happens:**
Content authors (or the site owner) write naturally in Markdown and forget that MDX parses JSX literals. Curly braces in ingredient formulas, angle brackets in temperature ranges, and HTML shortcuts in tables are common in food documentation.

**How to avoid:**
Escape curly braces in prose with `\{` and `\}`, or wrap literal content in backticks. Replace `<url>` autolink syntax with `[url](url)` or plain text. Use `<br />` (self-closing) not `<br>`. Add ESLint/remark-lint rules to catch MDX syntax errors pre-commit. File extensions: use `.mdx` for any file mixing JSX components with Markdown; use `.md` for pure Markdown (simpler parser path).

**Warning signs:**
- Build error: "Could not parse expression with acorn" or "Unexpected character"
- A batch log page builds locally in dev (`pnpm start` has more forgiving error handling) but fails `pnpm build`
- New markdown file with a temperature range like `<180°C` causes build failure

**Phase to address:**
Pre-component setup phase. Add ESLint + remark-lint before authoring interactive batch log MDX files.

---

### Pitfall 5: Infima Color Variables Not Set for Both Light and Dark Mode

**What goes wrong:**
A custom theme color looks correct in light mode, completely fails in dark mode. Interactive components (cards, charts, calculators) inherit color values that work against one background but become invisible or unreadable against the other. The default green (`#2e8555`) already works but any new data visualization colors or component-specific styles added without `[data-theme='dark']` variants will regress.

**Why it happens:**
Developers add a color to `custom.css` under `:root {}` only, assuming the browser handles contrast inversion. Docusaurus dark mode is opt-in per-variable — it does not auto-invert. Chart colors defined as hex values in component code have no knowledge of dark mode at all.

**How to avoid:**
For every CSS variable defined under `:root {}`, also define a `[data-theme='dark'] {}` variant. For chart/visualization colors, use CSS custom properties referenced by JavaScript, not hardcoded hex strings. Run Lighthouse or browser devtools accessibility checker in both modes before shipping any visual phase.

**Warning signs:**
- Component looks fine in light mode, visually broken in dark mode
- Color contrast audit failures in dark mode only
- Chart lines invisible because their color matches the dark background

**Phase to address:**
Theme identity phase. Establish full light/dark variable set before building components that reference those variables.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Inline batch data as component props | Faster to ship first chart | Every data correction requires code change; diverges across components | Never — establish JSON source immediately |
| Swizzle --eject for navbar | Full layout control immediately | Manual forward-port on every Docusaurus minor version | Only if --wrap is genuinely insufficient; document the decision |
| Hardcode hex colors in chart components | Simpler component code | Dark mode breaks; rebrand requires hunting all components | Never — use CSS variables |
| Skip `<BrowserOnly>` wrapper, use `typeof window` guard | Shorter component code | Hydration mismatch error; React error #418 in production | Never — use BrowserOnly |
| Keep .docusaurus/ committed to git | No regeneration needed locally | Merge conflicts on generated files; repo bloat | Never — add to .gitignore immediately |
| Keep batch data only in markdown frontmatter | No separate file to maintain | Cannot aggregate across docs without a plugin; calculators must duplicate data | Acceptable for display-only metadata (title, date); unacceptable for numeric data used in calculations |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Recharts / Chart.js | Importing at top of MDX file, triggering SSR build failure | Wrap in `<BrowserOnly>` with require() inside the render function |
| JSON data files | Placing in `static/` directory and fetching at runtime | Import directly as ES modules from `src/data/` for build-time type safety |
| GitHub Pages + custom domain | CNAME file absent from static assets | Place CNAME file in `static/` directory so Docusaurus copies it to build output automatically |
| GitHub Actions deploy | Using `docusaurus deploy` script manually | Use `peaceiris/actions-gh-pages` action with `publish_dir: ./build`; set `CNAME` in action config |
| CSS Modules in custom components | Relying on Infima class names (e.g., `.menu__link`) | Target stable Docusaurus layout class names or use CSS Modules scoped to your component |
| MDX component imports | Importing a component that uses `useState` but not marking file `.mdx` | Use `.mdx` extension for any markdown file containing JSX imports or exports |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Importing entire chart library globally | 200-400KB added to every page bundle, even pages without charts | Dynamic import / `React.lazy()` inside `<BrowserOnly>` wrapper | From the first page that doesn't use charts |
| Putting all batch data in one large JSON | Component re-renders on any data change; bundle includes all historical data | Split into per-batch files; only import what a specific component needs | When batch count exceeds ~20 entries (manageable for current scale) |
| Re-computing derived values (ratios, costs) at render time | Noticeable lag on calculator input | Memoize with `useMemo`; pre-compute static values at module load | Not a concern at current data volume but a habit worth establishing |
| Unoptimized images in static/ | Slow page loads, poor Lighthouse scores | Use WebP format; add `loading="lazy"` to images; consider image optimization plugin | From day 1 if photos of batches are added |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Calculator shows no input on page load (blank form) | User doesn't know what values to enter | Pre-populate with a representative batch's values as defaults |
| Calculator outputs update on every keystroke with no debounce | Jarring flash on each character typed | Debounce numeric inputs 150-300ms or trigger on blur |
| Chart renders at full desktop width on mobile | Horizontal scroll, broken layout | Use `ResponsiveContainer` (Recharts) or equivalent; test at 375px viewport |
| Batch comparison shows all fields including irrelevant ones | Noise obscures meaningful differences | Filter to fields that differ; highlight divergence, not similarity |
| Navigation only shows "Biltong Logs" | User cannot find sourdough/fermentation content when added | Plan sidebar categories before adding new content domains |

---

## "Looks Done But Isn't" Checklist

- [ ] **Chart component:** Works in `pnpm start` — verify `pnpm build` also succeeds (SSG may fail even if dev server works)
- [ ] **Dark mode:** Tested all new components in dark mode explicitly — CSS variable scoping can look complete but miss dark variants
- [ ] **Calculator:** Handles edge case inputs (zero weight, negative values, non-numeric) — React input without validation silently passes NaN to calculations
- [ ] **CNAME and custom domain:** After any deploy pipeline change, verify the custom domain survives the next deployment
- [ ] **Batch data schema:** New batch added to JSON file, all consuming components updated — easy to add markdown but forget the data file
- [ ] **Mobile layout:** Interactive components tested at 375px — Docusaurus responsive defaults don't extend to custom components
- [ ] **Swizzled components:** After any `pnpm update`, verify swizzled components have no TypeScript errors and render correctly

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| window is not defined build crash | LOW | Wrap offending component in `<BrowserOnly>`; takes 15-30 minutes once identified |
| Swizzled component breaks on upgrade | MEDIUM | Compare ejected component against new version in node_modules; manually forward-port changes; consider switching to --wrap variant |
| Batch data duplicated and diverged | HIGH | Audit all data references across components; create canonical JSON; update all consumers; test every chart and calculator |
| CNAME deleted by deployment | LOW | Add CNAME to `static/` directory immediately; verify in next deploy |
| MDX parse error in batch log | LOW | Escape or fix the offending character; run `pnpm build` to verify before pushing |
| Dark mode color regression | LOW-MEDIUM | Add `[data-theme='dark']` CSS variable overrides; audit all components that use custom colors |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| window is not defined / hydration mismatch | Phase introducing first interactive component | `pnpm build` succeeds (not just `pnpm start`) |
| Unsafe swizzle upgrade debt | Theme customization phase | Inventory of swizzled components documented; none flagged unsafe without written justification |
| No single source of truth for batch data | Data architecture phase (before any calculators) | All numeric component props trace to `src/data/`; no literals in component code |
| MDX strict syntax breakage | Pre-component setup / linting phase | `pnpm build` passes after each new `.mdx` file; ESLint remark-lint in CI |
| Light/dark mode color gap | Theme identity phase | Lighthouse accessibility pass in both modes; manual visual check |
| GitHub Pages CNAME loss | CI/deployment setup phase | CNAME file present in `static/`; custom domain survives 3 consecutive deploys |
| Bundle size from chart libraries | Same phase as chart integration | Lighthouse Performance score does not degrade on pages without charts |

---

## Sources

- [Docusaurus SSG documentation — browser API access, BrowserOnly, useIsBrowser](https://docusaurus.io/docs/advanced/ssg)
- [Docusaurus Swizzling guide — safety levels, wrapping vs ejecting](https://docusaurus.io/docs/swizzling)
- [Docusaurus Styling and Layout — Infima variables, dark mode CSS](https://docusaurus.io/docs/styling-layout)
- [GitHub issue #9884 — Hydration failed because initial UI does not match server render](https://github.com/facebook/docusaurus/issues/9884)
- [GitHub issue #3889 — Deploying to GitHub Pages removes custom domain](https://github.com/facebook/docusaurus/issues/3889)
- [GitHub discussion #9053 — MDX v3 upgrade support and breaking changes](https://github.com/facebook/docusaurus/discussions/9053)
- [Recharts GitHub issue #301 — document is not defined SSR error](https://github.com/recharts/recharts/issues/301)
- [GitHub community discussion #22366 — GitHub Pages resets custom domain on push](https://github.com/orgs/community/discussions/22366)
- Project-specific: `.planning/codebase/CONCERNS.md` — existing concerns around committed `.docusaurus/` cache, missing linting, CNAME management history

---

*Pitfalls research for: Interactive Docusaurus food knowledge base (Noble Notations)*
*Researched: 2026-03-13*
