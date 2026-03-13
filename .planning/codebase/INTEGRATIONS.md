# External Integrations

**Analysis Date:** 2026-03-13

## APIs & External Services

**Search:**
- Algolia - Integrated via @docusaurus/preset-classic for documentation search
  - SDK/Client: @algolia/autocomplete-preset-algolia, algoliasearch
  - Configuration: Defined in docusaurus.config.ts theme config

**Code Highlighting:**
- Prism - Via prism-react-renderer for syntax highlighting
  - No external service calls; local rendering only

## Data Storage

**Databases:**
- Not used - This is a static site with no backend

**File Storage:**
- Local filesystem only
- Documentation files in `/docs` directory
- Static assets in `/static` directory
- Build output in `/build` directory (generated)

**Caching:**
- None - Static generated site, cache handled by CDN/hosting provider

## Authentication & Identity

**Auth Provider:**
- None - No authentication required (public documentation site)

## Monitoring & Observability

**Error Tracking:**
- Not detected - No error tracking service integrated

**Logs:**
- No centralized logging - Build and development logs output to console

## CI/CD & Deployment

**Hosting:**
- Target: Generic static hosting service
- Production URL: `https://noble-notations.ryanjnoble.dev`
- Docusaurus configured for potential GitHub Pages deployment (organizationName: ryry79261, projectName: noble-notations)

**CI Pipeline:**
- Not detected - No GitHub Actions workflows or CI configuration found

**Deployment Method:**
- Manual deployment via `pnpm build && pnpm deploy`
- SSH deployment option available: `USE_SSH=true pnpm deploy`
- Git user deployment option: `GIT_USER=<username> pnpm deploy`
- Capability to deploy to gh-pages branch (GitHub Pages support)

## Environment Configuration

**Required env vars:**
- None enforced for production
- No `.env` files present
- Configuration entirely through TypeScript (docusaurus.config.ts)

**Secrets location:**
- Not applicable - No secrets or sensitive configuration needed
- GitHub deployment username/credentials passed via CLI flags

## Webhooks & Callbacks

**Incoming:**
- None

**Outgoing:**
- None

## Content Delivery

**Theme Assets:**
- SVG favicon embedded in config (data: URI, no external file)
- Logo: `/img/logo.svg` served from `/static` directory
- CSS customization: `/src/css/custom.css`

## Documentation Search (Algolia Integration)

**Configuration Location:**
- Integrated via @docusaurus/preset-classic
- Search configuration would be in docusaurus.config.ts themeConfig section
- Default Algolia autocomplete preset included in dependencies

---

*Integration audit: 2026-03-13*
