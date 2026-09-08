/**
 * Turbopack is the default bundler in Next 16, for `next dev` and for
 * `next build`. It reads `postcss.config.js|.mjs|.cjs|.ts|.mts|.cts` and
 * runs the plugin in a Node worker pool. `.mjs` because this package is
 * `"type": "module"`.
 *
 * Tailwind v4 needs no `tailwind.config.ts`. It is configured in CSS —
 * see `src/app/theme.css`.
 *
 * @type {import('postcss').Config}
 */
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

export default config;
