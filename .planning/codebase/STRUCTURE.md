# Codebase Structure

**Analysis Date:** 2026-03-13

## Directory Layout

```
noble-notations/
├── docs/                          # Source markdown content
│   ├── index.md                   # Homepage
│   ├── Biltong.md                 # Biltong cooking guide and notes
│   ├── biltong_logs/              # Subdirectory: batch logs for experiments
│   │   ├── _category_.json        # Category metadata (label, position, description)
│   │   ├── batch2.md
│   │   ├── batch3.md
│   │   ├── batch4.md
│   │   └── batch5.md
│   └── recipe_tinkering/          # Subdirectory: recipe research and experiments
│       ├── berlin-boil.md
│       ├── demi-glaze-research.md
│       ├── pickled_jalapenos.md
│       ├── peri-peri-as-a-cocktail.md
│       └── the_Art_of_Michelin-Level_Beef_Wellington.md
├── src/                           # Custom React components and styling
│   └── css/
│       └── custom.css             # Global theme overrides (CSS variables, colors)
├── static/                        # Static assets (images, logos, favicons)
│   └── img/
│       ├── logo.svg               # Site logo
│       ├── favicon.ico
│       ├── docusaurus.png
│       ├── docusaurus-social-card.jpg
│       ├── undraw_docusaurus_mountain.svg
│       ├── undraw_docusaurus_react.svg
│       └── undraw_docusaurus_tree.svg
├── build/                         # Generated static site (NOT committed)
│   ├── assets/                    # Minified CSS/JS for production
│   ├── category/                  # Generated category index pages
│   └── [page directories]/        # Generated HTML pages
├── .docusaurus/                   # Docusaurus build cache (NOT committed)
├── .planning/                     # GSD planning directory
│   └── codebase/                  # Architecture documentation
├── node_modules/                  # Dependencies (NOT committed)
├── docusaurus.config.ts           # Site configuration (title, URL, plugins, theme)
├── sidebars.ts                    # Sidebar/navigation structure configuration
├── tsconfig.json                  # TypeScript configuration
├── babel.config.js                # Babel transpiler configuration
├── package.json                   # Project metadata and npm scripts
├── pnpm-lock.yaml                 # Dependency lock file (pnpm)
├── .gitignore                     # Git ignore rules
└── README.md                      # Repository documentation
```

## Directory Purposes

**docs/:**
- Purpose: All source markdown content that becomes the website
- Contains: Markdown files (.md) with YAML frontmatter, category configuration JSON
- Key files: `index.md` (homepage), `Biltong.md` (main biltong guide), `biltong_logs/` (experimental batches), `recipe_tinkering/` (recipe research)
- File organization: Top-level markdown files become sidebar items; subdirectories become expandable categories in navigation

**docs/biltong_logs/:**
- Purpose: Experiment logs and batch records for biltong making
- Contains: Individual batch markdown files (batch2.md through batch5.md) documenting process, ingredients, weights, notes
- Key files: `_category_.json` (defines "Biltong Logs" label and "The science of biltong" description), numbered batch files
- Pattern: Each batch has YAML frontmatter with title and automatically inherits position from filename/directory position

**docs/recipe_tinkering/:**
- Purpose: Research notes and experimental recipe development
- Contains: Markdown files for various culinary projects (Berlin crayfish sourcing, Beef Wellington, cocktails, etc.)
- Key files: berlin-boil.md, the_Art_of_Michelin-Level_Beef_Wellington.md, peri-peri-as-a-cocktail.md, etc.
- Pattern: Each file is a standalone recipe/research document; auto-included in sidebar by directory scanning

**src/:**
- Purpose: Custom React components and stylesheets for site customization
- Contains: Only CSS in current setup; can contain React components (jsx/tsx) to override Docusaurus theme
- Key files: `css/custom.css` (theme colors and global styles)
- Usage: Docusaurus merges this with default theme during build

**src/css/:**
- Purpose: Global CSS variable overrides for theming
- Contains: CSS custom properties for primary colors, code highlighting, dark mode variants
- Key files: `custom.css` (green color scheme, Infima framework customization)
- Pattern: CSS variables are scoped to `:root` and `[data-theme='dark']` selectors

**static/:**
- Purpose: Files served as-is without processing (images, logos, favicons)
- Contains: SVG and image files used in site UI and markdown content
- Key files: `img/logo.svg` (navbar logo), `img/favicon.ico` (browser tab icon)
- Behavior: Files in `static/` are copied to `build/` root during build; referenced by path `/img/...`

**build/:**
- Purpose: Generated static website (output of build process)
- Contains: HTML files, minified CSS/JS bundles, optimized images, generated category pages
- Generated: Yes (created by `pnpm build`)
- Committed: No (in .gitignore)
- Pattern: Directory structure mirrors `docs/` structure; ready for deployment to static hosting

**.docusaurus/:**
- Purpose: Build cache and generated metadata
- Generated: Yes (created by Docusaurus during build/dev)
- Committed: No (in .gitignore)
- Pattern: Internal to Docusaurus; stores parsed markdown, plugin output, type definitions

## Key File Locations

**Entry Points:**
- `docs/index.md` - Homepage (slug: /, sidebar_position: 0)
- `docusaurus.config.ts` - Site config; loaded first by Docusaurus CLI
- `package.json` - npm script entry points (start, build, serve)

**Configuration:**
- `docusaurus.config.ts` - Site title, URL, navbar items, theme colors, plugins
- `sidebars.ts` - Sidebar auto-generation rules; currently uses autogenerated from `docs/` directory
- `tsconfig.json` - TypeScript compiler options (extends @docusaurus/tsconfig)
- `babel.config.js` - Babel preset for Docusaurus JSX transpilation

**Core Logic:**
- `docs/Biltong.md` - Main biltong reference document (slug: /biltong, sidebar_position: 1)
- `docs/biltong_logs/_category_.json` - Defines "Biltong Logs" category metadata
- `docs/recipe_tinkering/` - Recipe research directory (auto-discovered)

**Styling:**
- `src/css/custom.css` - CSS variable overrides; imported globally by Docusaurus

**Assets:**
- `static/img/logo.svg` - Navbar/favicon logo
- `static/img/docusaurus-social-card.jpg` - Open Graph/social media preview image

## Naming Conventions

**Files:**
- `.md` - Markdown content files
- `_category_.json` - Directory metadata (Docusaurus convention; underscore prefix denotes metadata)
- `.config.ts` - Configuration files in TypeScript
- `.svg` - Vector graphics for logos and icons
- `batch[N].md` - Numbered batch experiment logs (batch2.md, batch3.md, etc.)

**Directories:**
- `docs/` - Top-level source content (Docusaurus convention)
- `src/` - Custom source code (React components, CSS)
- `static/` - Static assets (Docusaurus convention)
- `build/` - Build output directory
- Lowercase with underscores for multi-word directories (e.g., `biltong_logs`, `recipe_tinkering`)

**URLs (generated from file paths):**
- `/docs/index.md` → `/` (homepage)
- `/docs/Biltong.md` → `/biltong` (lowercase, unless custom slug provided)
- `/docs/biltong_logs/batch5.md` → `/biltong_logs/batch5/`
- Custom slugs override defaults (e.g., `/docs/Biltong.md` uses slug: `/biltong` in frontmatter)

## Where to Add New Code

**New Documentation Page:**
- Primary content: Create `.md` file in `/home/ryan/repos/Personal/noble-notations/docs/` or subdirectory
- Add frontmatter with `title:`, `sidebar_position:` (optional), `slug:` (optional) fields
- Markdown content becomes page body
- Example: `/home/ryan/repos/Personal/noble-notations/docs/recipe_tinkering/new-recipe.md`

**New Experiment Category:**
- Create new subdirectory in `/home/ryan/repos/Personal/noble-notations/docs/` (e.g., `fermentation_logs/`)
- Create `_category_.json` with label, position, description
- Add markdown files to subdirectory
- Docusaurus auto-discovers and adds to sidebar
- Example structure:
  ```
  docs/fermentation_logs/
  ├── _category_.json    # {"label": "Fermentation Logs", "position": 3, ...}
  └── batch1.md
  ```

**New Styling/Theme:**
- Global CSS: Add to `/home/ryan/repos/Personal/noble-notations/src/css/custom.css`
- Component overrides: Create React components in `/home/ryan/repos/Personal/noble-notations/src/` subdirectories (e.g., `components/`, `theme/`)
- Use Docusaurus swizzle for theme component wrapping: `pnpm docusaurus swizzle @docusaurus/preset-classic [ComponentName]`

**Utilities/Scripts:**
- Custom Node.js scripts: Add to `scripts/` directory if created (not currently used)
- Docusaurus plugins: Define in `docusaurus.config.ts` presets section

## Special Directories

**build/:**
- Purpose: Deployment artifact directory
- Generated: Yes (created by `pnpm build`)
- Committed: No (excluded in .gitignore)
- Cleanup: Safe to delete; regenerated on next build

**.docusaurus/:**
- Purpose: Build cache and metadata
- Generated: Yes (automatic during `pnpm start` or `pnpm build`)
- Committed: No (excluded in .gitignore)
- Cleanup: Safe to delete; regenerated on next build

**.claude/:**
- Purpose: Claude AI tool workspace (not part of static site)
- Generated: External tool output
- Committed: No (tracked in git but not deployed)

---

*Structure analysis: 2026-03-13*
