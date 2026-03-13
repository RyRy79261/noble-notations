# Codebase Concerns

**Analysis Date:** 2026-03-13

## Incomplete Documentation

**Empty recipe stub:**
- Issue: `docs/recipe_tinkering/peri-peri-as-a-cocktail.md` contains only front matter with no content
- Files: `docs/recipe_tinkering/peri-peri-as-a-cocktail.md`
- Impact: Navigation displays incomplete page; users see empty content; presents unfinished appearance
- Fix approach: Either populate with actual recipe content or remove from sidebars configuration and file system

## Content Organization Issues

**Inconsistent content structure:**
- Issue: Biltong batch logs are sparse and incomplete, with gaps in documentation continuity
- Files: `docs/Biltong.md`, `docs/biltong_logs/batch2.md`, `docs/biltong_logs/batch3.md`, `docs/biltong_logs/batch4.md`, `docs/biltong_logs/batch5.md`
- Impact: Makes it difficult to follow experimental progress; lacks narrative coherence
- Fix approach: Establish documentation template for batch logs with consistent fields (date, weight, ingredients, measurements, results)

**Missing front matter in content:**
- Issue: `docs/Biltong.md` uses custom slug and sidebar_label but other batch files may not follow same convention
- Files: `docs/biltong_logs/batch*.md`
- Impact: Potential sidebar ordering inconsistencies or SEO issues
- Fix approach: Verify all documentation files have complete front matter with title, slug, sidebar_label, and sidebar_position

## Build System Concerns

**No linting or formatting configuration:**
- Issue: No `.eslintrc`, `.prettierrc`, or code quality tooling detected in project root
- Files: Project-wide (missing)
- Impact: No enforced code style; inconsistent formatting across TypeScript/MDX files; no static analysis
- Fix approach: Add Prettier config (`.prettierrc.json`) and ESLint config (`.eslintrc.json`) at project root

**TypeScript configuration minimal:**
- Issue: `tsconfig.json` is sparse with only baseline Docusaurus config; no strict type checking configured
- Files: `tsconfig.json`
- Impact: Type safety not fully leveraged; potential runtime errors from loose typing
- Fix approach: Enable strict mode options in TypeScript compiler: `"strict": true`, `"noImplicitAny": true`, `"noUnusedLocals": true`

## Deployment Process Issues

**Multiple deployment commits suggest manual process:**
- Issue: Git history shows numerous "deploy:" commits indicating repeated manual deployment trigger
- Files: Git history (entire repo)
- Impact: Risk of deployment inconsistency; deploys are manual and not automated; CNAME file has been created/deleted multiple times
- Fix approach: Implement GitHub Actions workflow for automated deployment on commit to main branch

**CNAME management complexity:**
- Issue: Git history shows CNAME file being repeatedly created, deleted, and recreated (10+ times)
- Files: `CNAME` (at repo root)
- Impact: Domain configuration fragility; risk of deployment breaking DNS resolution
- Fix approach: Define CNAME configuration in a single location (either docusaurus.config.ts or environment variable) and generate it during build

## Dependency Management

**No explicit Node/pnpm version pinning in config:**
- Issue: `package.json` defines engine requirements (`>=18.0` for Node, `>=8.0.0` for pnpm) but these are loose ranges
- Files: `package.json`
- Impact: Different developers/CI systems may use incompatible Node/pnpm versions causing build inconsistencies
- Fix approach: Add `.nvmrc` file with exact Node version (e.g., `18.18.0`) and `.pnpmrc` with exact pnpm version

**Stale Docusaurus cache:**
- Issue: `.docusaurus/` directory is committed to git (generated files)
- Files: `.docusaurus/` directory (entire)
- Impact: Large repository size; merge conflicts on generated files; inconsistent builds
- Fix approach: Add `.docusaurus/` to `.gitignore` and ensure builds regenerate cache on every run

## Documentation Maintenance

**Hardcoded copyright year in config:**
- Issue: `docusaurus.config.ts` line 76 uses `new Date().getFullYear()` which updates dynamically but can cause unnecessary diffs
- Files: `docusaurus.config.ts`
- Impact: Minor: unnecessary git changes if config is rebuilt; copyright stays correct at runtime
- Fix approach: No action required functionally, but could be moved to environment config if copyright management becomes important

**Test coverage:**
- Issue: No test files or testing infrastructure detected
- Files: Project-wide (missing)
- Impact: Documentation builds and content cannot be validated; broken links not caught until deployment; no validation of markdown structure
- Fix approach: Implement Docusaurus link validation using built-in checks or add integration tests for content consistency

## Accessibility & Performance

**No accessibility configuration visible:**
- Issue: No explicit accessibility testing or lighthouse CI integration
- Files: Project-wide (missing)
- Impact: Site may have accessibility issues undetected; WCAG compliance not verified
- Fix approach: Add Lighthouse CI workflow to catch accessibility regressions; audit existing content for alt text on images

**Build output not optimized:**
- Issue: No visible image optimization or bundle size monitoring
- Files: `static/` directory (not examined for optimization)
- Impact: Potential performance issues if static assets are large; no tracking of build size trends
- Fix approach: Add image optimization in build pipeline and bundle size monitoring to CI

## Git & Version Control

**Missing Git hooks:**
- Issue: No pre-commit or pre-push hooks configured
- Files: `.git/hooks/` (empty or default)
- Impact: Broken content (empty files, malformed markdown) can be committed; linting errors not caught
- Fix approach: Add husky configuration with pre-commit hooks to validate markdown and prevent incomplete content commits

**Inconsistent commit messages:**
- Issue: Git log shows mixed conventions: `fix:`, `feat:`, `deploy:` prefixes with no clear standard
- Files: Git history
- Impact: Difficult to track actual feature work vs. deployment overhead; deploy commits clutter history
- Fix approach: Establish conventional commits standard; automate deploy commits with `[skip ci]` flag

---

*Concerns audit: 2026-03-13*
