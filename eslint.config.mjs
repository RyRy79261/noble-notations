import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import nextPlugin from '@next/eslint-plugin-next';

export default tseslint.config(
  {
    ignores: [
      '.next/**',
      'out/**',
      'node_modules/**',
      'drizzle/**',
      'content/**',
      'next-env.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { '@next/next': nextPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  /**
   * THE READ PATH MAY NOT NAME A TABLE THAT HOLDS DELETED ROWS.
   *
   * Six tables carry a soft delete and each has a `*_live` view over it that
   * is `WHERE deleted_at IS NULL`. A read that names the base table by
   * mistake publishes a record somebody deleted, and it does it silently:
   * nothing throws, the page renders, and the row is simply back.
   *
   * A shared `and(live(t), …)` helper was the other way to state this rule
   * and is weaker for one reason — a helper can be left out of a new query,
   * an import ban cannot. `read.ts` holds fifteen exported functions and
   * about forty statements inside them; the sixteenth is written by somebody
   * who has not read this comment, and `pnpm lint` is a CI gate.
   *
   * The child tables are deliberately absent from the list. A child row
   * carries no flag of its own — its lifetime is its parent's — and every
   * child read in `read.ts` starts from a live parent, so naming
   * `recipe_ingredients` is correct and naming `recipes` is not.
   *
   * Two files see the base tables on purpose and neither is `read.ts`:
   * `write.ts`, which writes the flag, and `deleted.ts`, which lists the bin.
   * `read.ts` has one narrow exception, `recipeRevisionsAll`, and it comes
   * through `src/lib/queries/live.ts` so the alias itself says the row may be
   * deleted.
   */
  {
    files: ['src/lib/queries/read.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@/db/schema',
              importNames: [
                'recipes',
                'recipeRevisions',
                'notes',
                'experiments',
                'ingredients',
                'taxonomyTerms',
              ],
              message:
                'Read from the *Live views. The base table includes deleted ' +
                'rows. src/lib/queries/deleted.ts is the one read file ' +
                'allowed to see them.',
            },
          ],
          /*
           * `paths` matches the LITERAL specifier, so it refuses
           * `@/db/schema` and passes `../../db/schema` — the same module,
           * the same six tables, and `pnpm lint` and `pnpm typecheck` both
           * green. A rule this file, `read.ts` and AGENTS.md all describe as
           * something a new query CANNOT get past has to hold for every
           * spelling of the module, so the relative ones are matched as a
           * pattern.
           */
          patterns: [
            {
              group: ['**/db/schema', '**/db/schema.*'],
              importNames: [
                'recipes',
                'recipeRevisions',
                'notes',
                'experiments',
                'ingredients',
                'taxonomyTerms',
              ],
              message:
                'Read from the *Live views. The base table includes deleted ' +
                'rows. src/lib/queries/deleted.ts is the one read file ' +
                'allowed to see them.',
            },
          ],
        },
      ],
    },
  },
);
