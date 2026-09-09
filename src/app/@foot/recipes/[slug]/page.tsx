import { PageFoot } from '@/components/f/page-foot';
import { getRecipeIdentity } from '@/lib/queries/read';
import { safeRead } from '@/lib/safe';
import { revisionOrdinal } from '@/lib/site';

/**
 * The primary screen's foot. `recipe-1280.html:3957`.
 *
 *   EFFECTIVITY: SIXTH REVISION AND ON   NN-04-02 · SIXTH REVISION
 *
 * WHY THIS FILE HAD TO EXIST. A parallel slot only falls back to
 * `default.tsx` on a HARD load: a client navigation keeps the previously
 * active slot when the new route matches none of its own (Next.js, parallel
 * routes). Every recipe link on `/`, `/recipes`, `/search`, `/list`,
 * `/cuisines/[slug]`, `/classes/[type]/[slug]`, `/ingredients/[slug]` and
 * `/science/[slug]` is a `next/link`, so the normal way onto the primary
 * screen left it wearing `NN/ARCHIVE`, `NN-00-01` or `NN/LIST` — whichever
 * screen the reader came from. Every e2e spec reaches a recipe with
 * `page.goto`, which is a hard load, so no test could see it.
 *
 * A catch-all `@foot/[...rest]/page.tsx` would fix the same case and break a
 * worse one — it makes `/nope` a 404 with an empty `<body>` — so the two
 * missing routes get the two files they need instead.
 *
 * THE EFFECTIVITY IS READ HERE AND NOT ASSUMED. `/`, `/recipes` and
 * `/science` write `EFFECTIVITY: SIXTH REVISION AND ON` as a document
 * constant, because there it is a statement about the issue of the whole
 * manual. On this screen it is a statement about THIS recipe, and the
 * recipe's own current revision is what it has to say. `getRecipeIdentity`
 * is the cheap read — three columns, one join — rather than the eleven-table
 * `getRecipeBySlug` the page itself runs.
 *
 * The right slot loses the catalogue number, which nothing in the schema
 * holds — the same call `@foot/recipes/[slug]/batch-logs/page.tsx` makes —
 * and keeps the document's address.
 */
export default async function RecipeFoot({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { data } = await safeRead(() => getRecipeIdentity(slug), null);

  const ordinal =
    data?.revisionNumber != null
      ? revisionOrdinal(data.revisionNumber)
      : undefined;

  return (
    <PageFoot
      /* R-STA-01: with no database there is no revision to be effective
         from, and `PageFoot`'s default issue line is what the design draws
         on every screen that has no effectivity to state. */
      left={ordinal ? `Effectivity: ${ordinal} and on` : undefined}
      right={`NN/RECIPES/${slug}`}
    />
  );
}
