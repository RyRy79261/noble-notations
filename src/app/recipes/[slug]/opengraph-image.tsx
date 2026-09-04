import { ImageResponse } from 'next/og';
import { getRecipeBySlug } from '@/lib/queries/read';
import { safeRead } from '@/lib/safe';
import { site } from '@/lib/site';

// A static string: `generateImageMetadata` would allow a per-recipe alt, but
// Next calls it during build-time metadata collection with no params, which
// fails for a route that has no generateStaticParams. The recipe's own title
// travels in og:title alongside this card.
export const alt = 'Recipe card from Noble Notations';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * Per-recipe social card.
 *
 * Shows the things that make this repository different from a recipe blog:
 * the revision number and the classification. If the database is unreachable
 * the card still renders with the slug, because a broken image in a shared
 * link is worse than a plain one.
 */
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
        background: '#0b0910',
        backgroundImage:
          'radial-gradient(circle at 82% 12%, rgba(155,109,255,0.28), transparent 58%)',
        padding: '72px 80px',
        color: '#e9e5f2',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '20px',
          color: '#b794ff',
          fontSize: 26,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
        }}
      >
        <span>{site.name}</span>
        {revision ? (
          <span style={{ color: '#7a7194' }}>revision {revision}</span>
        ) : null}
      </div>

      <div
        style={{
          fontSize: title.length > 42 ? 62 : 78,
          fontWeight: 700,
          lineHeight: 1.08,
          marginTop: 30,
          letterSpacing: '-0.025em',
          display: 'flex',
        }}
      >
        {title}
      </div>

      {summary ? (
        <div
          style={{
            fontSize: 28,
            color: '#a99fc2',
            marginTop: 24,
            lineHeight: 1.4,
            display: 'flex',
            maxWidth: 1000,
          }}
        >
          {summary.length > 170 ? `${summary.slice(0, 170)}…` : summary}
        </div>
      ) : null}

      <div
        style={{
          display: 'flex',
          gap: '14px',
          marginTop: 'auto',
          flexWrap: 'wrap',
        }}
      >
        {terms.map((term) => (
          <div
            key={term}
            style={{
              display: 'flex',
              fontSize: 24,
              color: '#b794ff',
              border: '1px solid rgba(183,148,255,0.42)',
              background: 'rgba(183,148,255,0.12)',
              borderRadius: 999,
              padding: '8px 22px',
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
