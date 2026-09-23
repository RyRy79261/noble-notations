import type { Metadata } from 'next';
import { Geist, Geist_Mono, Newsreader } from 'next/font/google';
import { site } from '@/lib/site';
// theme.css is the only stylesheet, and this is the only file that imports
// it. It is one `@import 'tailwindcss'` — theme, preflight and utilities —
// plus the design's tokens and one `@layer base` block. Until M7 it also
// pulled `globals.css` in under a cascade layer of its own; that file is
// deleted (D-03). See the note at the top of theme.css.
import './theme.css';

/*
 * The three faces of DIRECTION F. next/font/google downloads each WOFF2 at
 * build time and serves it from /_next/static/media, so the CSP in
 * next.config.ts is satisfied: the file is same-origin for
 * `font-src 'self' data:` and the generated @font-face is inline for
 * `style-src 'self' 'unsafe-inline'`. A <link> to fonts.googleapis.com is a
 * stylesheet from a host that is not in style-src and would be blocked.
 *
 * The variable names avoid --font-sans and --font-mono. `globals.css`
 * declared those two for the system stacks and the suffix kept them apart;
 * that file went at M7 and the names stayed, because they are now what
 * Tailwind's --default-font-family and --default-mono-font-family resolve
 * to. See the note in theme.css.
 */
const newsreader = Newsreader({
  subsets: ['latin'],
  display: 'swap',
  // Newsreader is an optical-size design and the titles run from 24px to
  // 72px, so opsz has to be asked for by name. wght is always included and
  // naming it is an error.
  axes: ['opsz'],
  style: ['normal', 'italic'],
  variable: '--font-serif',
});

const geistSans = Geist({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans-ui',
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono-ui',
});

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: `${site.name} — ${site.tagline}`,
    template: `%s · ${site.name}`,
  },
  description: site.description,
  applicationName: site.name,
  authors: [{ name: site.author }],
  openGraph: {
    type: 'website',
    siteName: site.name,
    locale: 'en_GB',
    url: site.url,
    title: `${site.name} — ${site.tagline}`,
    description: site.description,
  },
  twitter: {
    card: 'summary_large_image',
    title: `${site.name} — ${site.tagline}`,
    description: site.description,
  },
  alternates: {
    canonical: '/',
    // /llms.txt is the map an agent reads before it starts fetching. It is
    // only discoverable by convention otherwise, so say where it is.
    types: { 'text/plain': '/llms.txt' },
  },
  robots: { index: true, follow: true },
};

import { Announcer } from './announcer';
import { SiteHeader } from '@/components/f/site-header';
import { SkipLink } from '@/components/f/skip-link';
import { HeaderHeight } from '@/components/header-height';
import { ShakeToReport } from '@/components/shake-to-report';

/**
 * THE PAGE FOOT IS A PARALLEL ROUTE, AND THIS IS WHY.
 *
 * C-04's outer two strings are per-screen copy — `FROZEN 08 SEP 2026 ·
 * ELEVEN NOTES` / `NN/ARCHIVE` on the archive, `COMPILED 08 SEP 2026 ·
 * TWENTY-SEVEN INGREDIENTS` / `NN/LIST` on the list — and several of them
 * are facts about the data on the screen rather than constants. So the foot
 * has to be composed per route, and `page-foot.tsx` has said so since M3.
 *
 * The three obvious ways to do that are all wrong here:
 *
 *   - A page cannot render it. `{children}` is inside `<main>`, and a
 *     `<footer>` inside `<main>` is not `contentinfo` (HTML-AAM); the
 *     document would lose its landmark on every rebuilt screen.
 *   - A route→strings map read in this file needs the pathname, and a
 *     Server Component has no way to ask for one. `headers()` would work
 *     only with a proxy matcher widened over the whole site, and
 *     `src/proxy.ts` documents at length why its scope is deliberately tiny.
 *   - `usePathname()` needs a client component, and §9.3 fixes the count of
 *     those at nine.
 *
 * A parallel route slot is the one mechanism that is none of those: it
 * renders as a SIBLING of `<main>`, on the server, per route, with the
 * route's own `params` and `searchParams` — so `src/app/@foot/archive/…`
 * can read what it needs to name what the reader is looking at.
 *
 * `src/app/@foot/default.tsx` is what a route with no slot of its own gets,
 * and it is the foot the site drew before M6. Nothing breaks by omission:
 * a screen that has not been rebuilt keeps the generic issue line, and a
 * screen that wants its own adds one file under `@foot/` mirroring its
 * route.
 *
 * THE 404 IS THE ONE ROUTE THE SLOT DOES NOT REACH, and the sentence that
 * stood here — "it is also what the 404 renders" — was measured wrong. On a
 * production build `/nope` came back with no page foot in it at all:
 * a root `not-found.tsx` is rendered through the `children` outlet's
 * `notFound` boundary and the `foot` outlet resolves to nothing beside it,
 * so `default.tsx` is never consulted. `foot` is still an outlet ELEMENT at
 * that point rather than `undefined`, so `foot ?? <PageFoot />` here does
 * not fire either — it was tried.
 *
 * `src/app/not-found.tsx` therefore renders its own `PageFoot`, inside
 * `<main>`, and says at length what that costs. Whoever owns this mechanism
 * should decide whether a `global-not-found.tsx` (Next 16) is the right
 * answer at M7; it would let the 404 compose its own shell and put the foot
 * back outside the landmark.
 */
export default function RootLayout({
  children,
  foot,
}: Readonly<{ children: React.ReactNode; foot: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${newsreader.variable} ${geistSans.variable} ${geistMono.variable}`}
      /*
       * The script below writes `data-theme` on this element before React
       * hydrates, so the server's markup and the client's first render
       * disagree about it by design. Without this, React warns on every
       * page load for a reader who has chosen a theme.
       *
       * It suppresses the warning for THIS element's attributes only, one
       * level deep. Nothing else in the tree is exempted by it.
       */
      suppressHydrationWarning
    >
      <body>
        {/*
         * THE THEME, BEFORE THE FIRST PAINT. D-16.
         *
         * `src/components/f/theme-toggle.tsx` is a client component and
         * R-STO-02 makes it read storage in an effect, which runs after the
         * first paint — so a reader who chose dark on a light machine would
         * see the light page flash first. This runs while the document is
         * still parsing, ahead of everything below it.
         *
         * It is inline because a file would be a second request and the
         * flash is exactly the time that request takes. The CSP allows it:
         * `script-src 'self' 'unsafe-inline'` in `next.config.ts`.
         *
         * The key is written out rather than imported: this is a string in
         * the server's HTML, and a string cannot import. `STORAGE_KEY` in
         * the toggle is the same value and `e2e/screen-theme.spec.ts`
         * reloads a page after using the real control, so the two cannot
         * drift apart unnoticed.
         *
         * Absent storage, a blocked store, or any value that is not
         * "light" or "dark" all leave the attribute off, which is the
         * follow-the-system state `theme.css` draws by default.
         */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              'try{var t=localStorage.getItem("nn:theme");' +
              'if(t==="light"||t==="dark")' +
              'document.documentElement.setAttribute("data-theme",t)}catch(e){}',
          }}
        />

        {/*
         * C-01, and the design's `F/Skip link`. Its caption in Plate II is
         * the whole specification: "FIRST CONTROL IN THE PAGE · OFF SCREEN
         * UNTIL IT TAKES KEYBOARD FOCUS · MOVES FOCUS TO #MAIN". §9.1 puts
         * it in this file and §9.5 gives it a name, so it is composed here
         * and drawn there.
         *
         * It is the first element in the body and it sits outside the shell,
         * which clips its own horizontal overflow.
         */}
        <SkipLink />

        {/*
         * R-ACC-06, and the drawer's modal boundary. The document's one
         * polite live region is a SIBLING of the shell, never a child of
         * it: Radix's `hideOthers` exempts every `[aria-live]` element and
         * every ancestor of one, so a region inside the shell would leave
         * the whole shell in the accessibility tree behind the open 360
         * drawer. See `src/lib/announce.ts`.
         */}
        <Announcer />

        {/*
         * `min-h-dvh` and the column keep the foot at the bottom of a short
         * screen. `overflow-x: clip` is load-bearing and it is `clip` and
         * not `hidden` on purpose: a tag tooltip is absolutely positioned
         * and about 350px wide, and even held at `visibility: hidden` it
         * still occupies layout, so a tag near the right edge used to push
         * every page carrying tags sideways at every width. `hidden` would
         * fix that and make this a scroll container, which would break the
         * sticky header inside it.
         */}
        <div className="flex min-h-dvh flex-col overflow-x-clip">
          <SiteHeader />

          {/* R-NAV-05. Anything that must clear the sticky header reads
              `--header-h`, because the header's height depends on its
              content — the list control alone moves it — and not on the
              width. */}
          <HeaderHeight />

          {/*
           * R-ACC-04: `tabIndex` so "Skip to content" actually moves focus.
           * Without it only Chromium's sequential-focus fallback papers
           * over the gap and Safari does nothing at all.
           *
           * The 60/16 gutter the design gives `Main` is deliberately NOT
           * here yet. Twenty screens still lay themselves out with the old
           * `.page` wrapper and its own padding, and adding a second gutter
           * under them would narrow every one of them for no gain until
           * M4 to M6 rebuild them.
           */}
          <main id="main" tabIndex={-1} className="flex-1">
            {children}
          </main>

          {/* C-04. The two outer strings are per-screen copy, so the foot
              is composed per route under `src/app/@foot/`. The 404 is the one
              route this outlet does not reach and it draws its own. See the
              note above `RootLayout`. */}
          {foot}
        </div>

        {/* Shake the phone to report a problem. Inert unless the visitor
            is the signed-in owner; see the component. */}
        <ShakeToReport />
      </body>
    </html>
  );
}
