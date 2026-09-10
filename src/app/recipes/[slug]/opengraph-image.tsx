import { ImageResponse } from 'next/og';
import { getRecipeBySlug } from '@/lib/queries/read';
import { safeRead } from '@/lib/safe';
import { revisionOrdinal, site } from '@/lib/site';

// A static string: `generateImageMetadata` would allow a per-recipe alt, but
// Next calls it during build-time metadata collection with no params, which
// fails for a route that has no generateStaticParams. The recipe's own title
// travels in og:title alongside this card.
export const alt = 'Recipe card from Noble Notations';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * Per-recipe social card, in DIRECTION F.
 *
 * It shows the two things that make this repository different from a recipe
 * blog: the revision number and the classification. If the database is
 * unreachable the card still renders from the slug, because a broken image
 * in a shared link is worse than a plain one.
 *
 * See the note in `src/app/opengraph-image.tsx` for why no web font is
 * loaded and why the card is drawn on paper rather than following the
 * reader's theme.
 *
 * The tags are square and hairlined, not pills. The design has one radius,
 * 2px, and it draws a tag as a rule rather than a capsule — a `borderRadius:
 * 999` here was the loudest thing on the old card.
 */
const PAPER = '#FCFAF6';
const INK = '#2B1F1C';
const INK_2 = '#574843';
const INK_3 = '#79655F';
const HAIR = '#E4D8D0';
const ACCENT = '#8E2A1E';

export default async function RecipeOpengraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { data: recipe } = await safeRead(() => getRecipeBySlug(slug), null);

  const title = recipe?.title ?? slug.replace(/-/g, ' ');
  const summary = recipe?.summary ?? recipe?.subtitle ?? '';
  const terms = recipe?.terms.slice(0, 4).map((term) => term.label) ?? [];
  const revision = recipe?.revisionNumber ?? null;

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: PAPER,
        padding: '64px 72px',
        color: INK,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '18px',
          width: '100%',
        }}
      >
        <div
          style={{
            display: 'flex',
            background: ACCENT,
            color: PAPER,
            padding: '8px 11px 8px 14px',
            fontSize: 22,
            letterSpacing: '0.12em',
          }}
        >
          NN
        </div>
        <div style={{ display: 'flex', fontSize: 34, color: INK }}>
          {site.name}
        </div>
        {revision ? (
          <div
            style={{
              display: 'flex',
              marginLeft: 'auto',
              fontSize: 20,
              color: INK_3,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
            }}
          >
            {revisionOrdinal(revision) ?? `Revision ${revision}`}
          </div>
        ) : null}
      </div>

      <div
        style={{
          display: 'flex',
          width: '100%',
          height: 1,
          background: HAIR,
          marginTop: 26,
        }}
      />

      <div
        style={{
          display: 'flex',
          marginTop: 'auto',
          fontSize: title.length > 42 ? 66 : 84,
          lineHeight: 1.05,
          letterSpacing: '-0.02em',
        }}
      >
        {title}
      </div>

      {summary ? (
        <div
          style={{
            display: 'flex',
            fontSize: 29,
            color: INK_2,
            marginTop: 24,
            lineHeight: 1.45,
            maxWidth: 960,
          }}
        >
          {summary.length > 170 ? `${summary.slice(0, 170)}…` : summary}
        </div>
      ) : null}

      <div
        style={{
          display: 'flex',
          width: '100%',
          height: 1,
          background: HAIR,
          marginTop: 'auto',
        }}
      />
      <div
        style={{
          display: 'flex',
          gap: '12px',
          marginTop: 22,
          flexWrap: 'wrap',
        }}
      >
        {terms.map((term) => (
          <div
            key={term}
            style={{
              display: 'flex',
              fontSize: 21,
              color: INK_3,
              border: `1px solid ${HAIR}`,
              padding: '7px 16px',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}
          >
            {term}
          </div>
        ))}
      </div>
    </div>,
    size,
  );
}
