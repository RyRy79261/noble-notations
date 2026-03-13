# Stack Research

**Domain:** Interactive food knowledge base / Docusaurus documentation site with data visualization
**Researched:** 2026-03-13
**Confidence:** HIGH (core stack), MEDIUM (styling patterns), HIGH (SSR workaround patterns)

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Docusaurus | 3.9.x | Site framework | Stable 3.x line, current project base. 3.9 adds Rspack 1.5 (faster builds). Node 20 required — upgrade needed from current 3.5.2. |
| React | 18.3.x | Component runtime | Already present. Recharts 3.x and all recommended libs target React 18/19. No upgrade needed. |
| Recharts | 3.8.x | Data visualization | 7M+ weekly downloads, composable SVG-first API, React-native design (not D3 bolted on), minimal bundle using only needed D3 submodules. Best fit for a small project that needs line/bar/area charts without heavy setup. |
| TypeScript | ~5.5.x | Type safety for components | Already in project. Component props for calculators benefit from strict typing. No change needed. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@docusaurus/BrowserOnly` | (bundled with core) | SSR guard for charts | Wrap every chart component — Recharts accesses `document` at init, which breaks static build without this guard. |
| `clsx` | ^2.1.x | Conditional className composition | Already present. Use in all custom components for dark/light mode class logic. |
| `react-hook-form` | ^7.54.x | Calculator form inputs | Uncontrolled-by-default reduces re-renders; built-in validation; works without a backend. Use for recipe scaling and cost calculators. |
| `use-debounce` | ^10.0.x | Debounce calculator input changes | Prevents expensive recalculations on every keystroke. Use in calculators with derived output fields. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| pnpm | Package manager | Already in use. Stick with it for consistent lockfile. |
| TypeScript strict mode | Catch component prop errors early | Extend `@docusaurus/tsconfig` as currently configured. |
| CSS Modules (`.module.css`) | Component-scoped styles | Built into Docusaurus webpack/rspack. Use `[component].module.css` naming. Avoid SCSS unless complexity demands it — plain CSS variables cover most theming needs here. |

---

## Installation

```bash
# Upgrade Docusaurus (requires Node 20+ first)
pnpm add @docusaurus/core@3.9.2 @docusaurus/preset-classic@3.9.2 @docusaurus/module-type-aliases@3.9.2 @docusaurus/tsconfig@3.9.2 @docusaurus/types@3.9.2

# Charting
pnpm add recharts

# Calculator form handling
pnpm add react-hook-form use-debounce
```

---

## The Critical SSR Pattern

Docusaurus does SSR (static HTML generation) at build time. Recharts calls browser APIs (`document`, `window`) during module initialization. This will break `pnpm build` without the guard.

Every chart component must use this pattern:

```tsx
// src/components/BatchTrendChart/index.tsx
import BrowserOnly from '@docusaurus/BrowserOnly';
import type { ChartData } from './types';

interface Props {
  data: ChartData[];
}

export function BatchTrendChart({ data }: Props) {
  return (
    <BrowserOnly fallback={<div className="chart-loading">Loading chart...</div>}>
      {() => {
        // require() inside the function body — NOT at module top level
        const { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } =
          require('recharts');
        return (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data}>
              <XAxis dataKey="batch" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="yield" stroke="#2e8555" />
            </LineChart>
          </ResponsiveContainer>
        );
      }}
    </BrowserOnly>
  );
}
```

Key rule: use `require()` inside the `BrowserOnly` callback, not `import` at the top of the file. A top-level import still gets evaluated during SSR even when the component is wrapped.

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Recharts 3.x | Nivo (`@nivo/*`) | If you need canvas rendering (performance with thousands of data points) or server-side PNG export. Nivo supports SSR natively. For biltong batch data (5-50 data points), Recharts SVG is plenty fast. |
| Recharts 3.x | Victory (Formidable) | If you need React Native support. No reason to choose it for a pure web Docusaurus site. |
| Recharts 3.x | Chart.js + react-chartjs-2 | If team is already fluent in Chart.js. The React wrapper adds an abstraction layer; Recharts is more idiomatically React. |
| react-hook-form | Controlled React state (`useState`) | For very simple calculators with 1-2 inputs, plain `useState` is fine and has zero dependencies. Use `react-hook-form` when a calculator has 5+ fields or needs validation (e.g., "weight must be positive"). |
| CSS Modules | Tailwind CSS | If the entire site were being redesigned from scratch. Adding Tailwind to an existing Infima site creates class conflicts and requires more configuration than it saves. |
| CSS Modules | SCSS/docusaurus-plugin-sass | If you need nesting or mixins. For this site's scope, plain CSS with `--ifm-*` variables covers the need without an extra dependency. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| D3.js directly | Requires manual DOM manipulation that conflicts with React's virtual DOM; significant complexity overhead for simple charts | Recharts (which uses D3 internally but exposes a React API) |
| Chart.js + react-chartjs-2 | Canvas-based; the react-chartjs-2 wrapper has historically had `ref` and lifecycle issues; more config overhead for marginal feature gain | Recharts |
| `@nivo/*` full suite | Heavy — each `@nivo/` sub-package pulls in separate D3 modules; adds ~40-60 kB per chart type; overkill for < 50 data points | Recharts |
| Tailwind CSS | Adding to existing Infima CSS system creates collision. Infima's `--ifm-*` variables already handle responsive theming. Tailwind's reset stylesheet conflicts with Infima's base styles | CSS Modules + Infima CSS variables |
| Top-level `import` for Recharts in MDX | Causes "document is not defined" during SSR build | `BrowserOnly` wrapper with `require()` inside the callback |
| Recharts 2.x | 2.x is unmaintained; 3.x rewrote state management, fixed long-standing bugs, removed `recharts-scale` and `react-smooth` deps. Migration is minimal (only accessibility default changed) | Recharts 3.x |

---

## Stack Patterns by Variant

**If a calculator is simple (1-3 inputs, immediate output):**
- Use plain React `useState` + CSS Modules
- No form library needed
- Pattern: controlled input → compute in render → display result

**If a calculator has validation (e.g., weight > 0, cost >= 0):**
- Use `react-hook-form` with `register` and `watch`
- Pattern: `useWatch` drives derived calculations, `register` handles validation

**If a chart needs to respond to user filter selections:**
- Keep chart data in a `useState` above the `BrowserOnly` wrapper
- Pass filtered data as props into the `BrowserOnly` callback
- Do NOT put filtering state inside the `BrowserOnly` child function

**If batch data lives in markdown frontmatter:**
- Extract to `.json` files in `src/data/`
- Import JSON directly in React components (Docusaurus webpack resolves JSON imports natively)
- Keeps MDX files readable; separates data from presentation

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| recharts@3.8.x | react@18.x, react@19.x | React 18 is current project version — fully compatible |
| react-hook-form@7.54.x | react@18.x | Compatible. RHF v7 is stable long-term; no v8 announced |
| Docusaurus@3.9.x | Node.js >=20.0 | Current project specifies `node >= 18.0` — must upgrade Node before upgrading Docusaurus |
| @nivo/core@0.99.x | react@18.x, react@19.x | React 19 support added in 0.99 — if Nivo is chosen later, 0.99.x is the correct version |

---

## Docusaurus Upgrade Note

The project is on Docusaurus 3.5.2. Latest stable is 3.9.2. Upgrading:

- Requires Node.js 20+ (current `engines` field says `>=18.0`)
- No MDX or content breaking changes between 3.5 and 3.9
- The upgrade is recommended before adding interactive components — 3.9 includes Rspack for faster builds, which helps during component development iteration
- GitHub Actions / CI workflows need Node version bumped to 20

---

## Sources

- [Docusaurus SSG docs — BrowserOnly pattern](https://docusaurus.io/docs/advanced/ssg) — HIGH confidence, official docs
- [Docusaurus MDX and React docs — component import/registration patterns](https://docusaurus.io/docs/markdown-features/react) — HIGH confidence, official docs
- [Docusaurus 3.9 release notes — Node 20 requirement, Rspack 1.5](https://docusaurus.io/blog/releases/3.9) — HIGH confidence, official release
- [Recharts GitHub releases — 3.8.0 latest stable](https://github.com/recharts/recharts/releases) — HIGH confidence
- [Recharts 3.0 migration guide](https://github.com/recharts/recharts/wiki/3.0-migration-guide) — HIGH confidence, official wiki
- [Recharts SSR issues — document is not defined](https://github.com/recharts/recharts/issues/39) — MEDIUM confidence, GitHub issue thread
- [Nivo 0.99 — React 19 support](https://github.com/plouc/nivo) — MEDIUM confidence, WebSearch verified
- [Docusaurus styling — CSS Modules and Infima variables](https://docusaurus.io/docs/styling-layout) — HIGH confidence, official docs
- [react-hook-form official site](https://react-hook-form.com/) — HIGH confidence, official docs
- [Best React chart libraries 2025 — LogRocket](https://blog.logrocket.com/best-react-chart-libraries-2025/) — LOW confidence, editorial

---

*Stack research for: Noble Notations — interactive components on Docusaurus 3.x*
*Researched: 2026-03-13*
