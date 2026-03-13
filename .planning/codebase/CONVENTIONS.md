# Coding Conventions

**Analysis Date:** 2026-03-13

## Project Type

This is a **Docusaurus-based static documentation site**, not a traditional application codebase. The project structure prioritizes markdown documentation over application code. Minimal TypeScript/JavaScript configuration is present.

## Naming Patterns

**Files:**
- Markdown documentation files use `.md` extension
- Configuration files use `.ts` extension (e.g., `docusaurus.config.ts`, `sidebars.ts`)
- CSS files use `.css` extension with kebab-case naming (e.g., `custom.css`)
- Documentation files use PascalCase for main topics (`Biltong.md`) and kebab-case for batch/log files (`batch2.md`, `berlin-boil.md`)
- Directory names use snake_case for organizational categories (`biltong_logs`, `recipe_tinkering`)

**TypeScript/JavaScript:**
- TypeScript configuration uses camelCase for function and variable names
- Type imports are explicit: `import type {SidebarsConfig} from '@docusaurus/plugin-content-docs'`
- Module.exports style used in `babel.config.js` for CommonJS compatibility

**Documentation Frontmatter:**
- YAML front matter at document head with `---` delimiters
- Uses `sidebar_position` for ordering
- Uses `slug` for custom URL routing
- Uses `sidebar_label` for navigation display

## Code Style

**Formatting:**
- TypeScript files formatted with 2-space indentation (inferred from `docusaurus.config.ts`)
- No explicit prettier or ESLint configuration found in project root
- Docusaurus default formatting conventions are implicitly followed

**Linting:**
- No custom ESLint configuration present
- No custom Prettier configuration present
- Relies on TypeScript compiler (`typecheck` script in package.json)

## Import Organization

**TypeScript Imports:**
1. Framework/library type imports first
2. Local application types second
3. Configuration constants (e.g., `const config: Config = { ... }`)

**Example from `docusaurus.config.ts`:**
```typescript
import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';
```

**Path Aliases:**
- Base URL path configured in `tsconfig.json`: `baseUrl: "."`
- No complex path aliases defined
- Imports use relative paths from root

## Error Handling

**Not applicable** - This is a static documentation site without runtime error handling patterns. No try-catch blocks or error boundaries observed in configuration files.

## Logging

**Not applicable** - No logging framework is used in the configuration or documentation files. Build and deployment happen through Docusaurus CLI commands defined in `package.json`.

## Comments

**JSDoc/TSDoc:**
- Comments present in `sidebars.ts` explaining the sidebar configuration
- Comments in `babel.config.js` are minimal
- Configuration files contain explanatory comments about disabled features

**Example from `sidebars.ts`:**
```typescript
/**
 * Creating a sidebar enables you to:
 - create an ordered group of docs
 - render a sidebar for each doc of that group
 - provide next/previous navigation
```

## Markdown Documentation Style

**Frontmatter Pattern:**
- All markdown files begin with YAML frontmatter block
- Standard fields: `slug`, `sidebar_position`, `sidebar_label`

**Example from `index.md`:**
```yaml
---
sidebar_position: 0
slug: /
---
```

**Markdown Headers:**
- Use H1 (`#`) for main title
- Use H2 (`##`) for sections
- Use H3 (`###`) for subsections

**Content Organization:**
- Batch logs use tables for structured data (see `batch2.md`)
- Lists for ingredients and instructions (see recipe files)
- Markdown tables for numerical/tabular data with markdown formatting

**Example table structure from batch2.md:**
```
| Index | Initial Weight (g) | Final Weight (g) | Cutting Date |
|-------|-------------------|------------------|--------------|
| A1    | 694               | 293              | 12.10.2024   |
```

## Configuration Conventions

**TypeScript Configuration:**
- Configuration objects use `satisfies` keyword for type-safe configuration
- Example: `} satisfies Preset.Options,` in `docusaurus.config.ts`

**Docusaurus Config Pattern:**
- Site metadata (title, tagline, URL) at top level
- Feature toggles (e.g., `blog: false`) for disabling plugins
- Theme configuration under `themeConfig` key
- Preset configuration under `presets` array

## Build Commands

**Package Scripts:**
- Located in `package.json` under `scripts` section
- Standard Docusaurus commands:
  - `start`: Development server
  - `build`: Production build
  - `typecheck`: TypeScript validation
  - `deploy`: GitHub Pages deployment

## Special Patterns

**Favicon/Logo:**
- Uses inline SVG data URIs for favicon and logo
- Theme toggling between light and dark modes in Prism theme config

**Disabled Features:**
- Blog functionality disabled: `blog: false`
- Only documentation content enabled

---

*Convention analysis: 2026-03-13*
