import { ImageResponse } from 'next/og';
import { site } from '@/lib/site';

export const alt = `${site.name} — ${site.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * The site-wide social card, in DIRECTION F.
 *
 * Rendered rather than shipped as a static asset so it stays in step with the
 * tagline and the palette. It carried the old purple ground and a radial
 * gradient until now, which made every shared link look like a different
 * site — and the design draws no gradient anywhere.
 *
 * NO WEB FONT IS LOADED, and that is deliberate. Satori falls back to its
 * bundled sans, so this route never fetches over the network at request
 * time. The design's Newsreader would need a font file in the repository and
 * a read on every card. The identity here is carried by the shape instead:
 * the mark, the rule, the mono kicker and the hierarchy. Those survive the
 * substitution; a serif at card size does not add much that they do not.
 *
 * The tokens are the light theme of `design/TOKEN-MAP.md`. A social card is
 * one fixed image, so it cannot follow `prefers-color-scheme`, and paper is
 * the ground the design leads with.
 */
const PAPER = '#FCFAF6';
const INK = '#2B1F1C';
const INK_2 = '#574843';
const INK_3 = '#79655F';
const HAIR = '#E4D8D0';
const ACCENT = '#8E2A1E';

export default function OpengraphImage() {
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
      {/* The site header: the mark, the wordmark, and the document issue. */}
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
          {site.issue}
        </div>
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

      {/* The page head: an accent kicker over a title over a lede. */}
      <div
        style={{
          display: 'flex',
          marginTop: 'auto',
          fontSize: 22,
          color: ACCENT,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
        }}
      >
        {site.tagline}
      </div>
      <div
        style={{
          display: 'flex',
          fontSize: 84,
          lineHeight: 1.05,
          marginTop: 20,
          letterSpacing: '-0.02em',
        }}
      >
        {site.name}
      </div>
      <div
        style={{
          display: 'flex',
          fontSize: 30,
          color: INK_2,
          marginTop: 26,
          maxWidth: 900,
          lineHeight: 1.45,
        }}
      >
        Every recipe is versioned. A dish gets refined across revisions, and
        each one records why it exists.
      </div>

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
          marginTop: 22,
          fontSize: 19,
          color: INK_3,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
        }}
      >
        Recipes · Science · Ingredients · Batch logs
      </div>
    </div>,
    size,
  );
}
