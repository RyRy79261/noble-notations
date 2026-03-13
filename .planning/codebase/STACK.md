# Technology Stack

**Analysis Date:** 2026-03-13

## Languages

**Primary:**
- TypeScript ~5.5.2 - Configuration and type definitions for Docusaurus setup
- JavaScript - Babel configuration and runtime

**Secondary:**
- Markdown - Content files (all documentation and recipes in `/docs`)
- CSS - Styling and theme customization

## Runtime

**Environment:**
- Node.js >=18.0

**Package Manager:**
- pnpm >=8.0.0
- Lockfile: pnpm-lock.yaml (present)

## Frameworks

**Core:**
- Docusaurus 3.5.2 - Static site generator for documentation/notes site
- @docusaurus/preset-classic 3.5.2 - Classic preset with docs, blog, pages support

**UI:**
- React 18.3.1 - Component framework
- react-dom 18.3.1 - React DOM rendering

**Content:**
- @mdx-js/react 3.1.0 - MDX support for React components in Markdown
- prism-react-renderer 2.4.0 - Syntax highlighting for code blocks

## Key Dependencies

**Critical:**
- @docusaurus/core 3.5.2 - Core Docusaurus framework and build system
- @docusaurus/preset-classic 3.5.2 - Documentation preset with theming

**UI/Utilities:**
- clsx 2.1.1 - Utility for constructing className strings
- Infima (bundled with classic preset) - CSS framework for content-centric sites

## Configuration

**Environment:**
- No .env files in use
- Configuration entirely through docusaurus.config.ts
- Build outputs to `/build` directory

**Build:**
- `babel.config.js` - Babel configuration using Docusaurus preset
- `tsconfig.json` - TypeScript configuration extending @docusaurus/tsconfig
- `docusaurus.config.ts` - Main Docusaurus configuration (Location: `/home/ryan/repos/Personal/noble-notations/docusaurus.config.ts`)
- `sidebars.ts` - Sidebar and navigation configuration (Location: `/home/ryan/repos/Personal/noble-notations/sidebars.ts`)

**Key Config Details:**
- Site URL: `https://noble-notations.ryanjnoble.dev`
- Base URL: `/`
- Docs route path: `/` (docs served at root)
- Theme: Infima with custom CSS overrides
- Syntax highlighting: GitHub theme (light), Dracula theme (dark)
- On broken links: throw error
- On broken markdown links: warn

## Platform Requirements

**Development:**
- Node.js 18.0 or higher
- pnpm 8.0.0 or higher

**Production:**
- Deployment target: Static hosting (any service that serves static HTML)
- Docusaurus generates static build to `/build` directory
- No server-side runtime required
- Site is deployed at: `https://noble-notations.ryanjnoble.dev`

## Build & Development Scripts

All scripts defined in `/home/ryan/repos/Personal/noble-notations/package.json`:

```
pnpm start              # Start development server with hot reload
pnpm build              # Build static site to /build directory
pnpm serve              # Serve built static site locally
pnpm typecheck          # TypeScript type checking
pnpm docusaurus [cmd]   # Direct Docusaurus CLI access
```

## Browser Support

**Production:**
- >0.5% market share
- Exclude dead browsers
- Exclude Opera Mini

**Development:**
- Last 3 Chrome versions
- Last 3 Firefox versions
- Last 5 Safari versions

---

*Stack analysis: 2026-03-13*
