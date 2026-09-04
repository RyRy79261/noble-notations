import { ImageResponse } from 'next/og';
import { site } from '@/lib/site';

export const alt = `${site.name} — ${site.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * The site-wide social card.
 *
 * Rendered rather than shipped as a static asset so it stays in step with the
 * tagline and palette. No web fonts are loaded — satori falls back to its
 * bundled sans, which keeps this route from depending on a network fetch at
 * request time.
 */
export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        background: '#0b0910',
        backgroundImage:
          'radial-gradient(circle at 78% 18%, rgba(155,109,255,0.30), transparent 55%)',
        padding: '80px',
        color: '#e9e5f2',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          color: '#b794ff',
          fontSize: 30,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
        }}
      >
        {site.name}
      </div>
      <div
        style={{
          fontSize: 78,
          fontWeight: 700,
          lineHeight: 1.1,
          marginTop: 28,
          letterSpacing: '-0.025em',
        }}
      >
        {site.tagline}
      </div>
      <div
        style={{
          fontSize: 31,
          color: '#a99fc2',
          marginTop: 28,
          maxWidth: 940,
          lineHeight: 1.4,
        }}
      >
        Recipes, ingredients, techniques and batch logs — versioned, so they get
        refined instead of re-derived.
      </div>
    </div>,
    size,
  );
}
