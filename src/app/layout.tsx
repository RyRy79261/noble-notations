import type { Metadata } from 'next';
import { Geist, Geist_Mono, Newsreader } from 'next/font/google';
import { site } from '@/lib/site';
// theme.css is the only stylesheet the layout imports. It pulls globals.css
// in under a cascade layer of its own, which is what lets a Tailwind utility
// beat an old element rule. Importing globals.css here as well would add it
// back unlayered and undo that. See the note at the top of theme.css.
import './theme.css';

/*
 * The three faces of DIRECTION F. next/font/google downloads each WOFF2 at
 * build time and serves it from /_next/static/media, so the CSP in
 * next.config.ts is satisfied: the file is same-origin for
 * `font-src 'self' data:` and the generated @font-face is inline for
 * `style-src 'self' 'unsafe-inline'`. A <link> to fonts.googleapis.com is a
 * stylesheet from a host that is not in style-src and would be blocked.
 *
 * The variable names avoid --font-sans and --font-mono. globals.css still
 * declares those two for its own rules and keeps them until M7.
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
import { PageFoot } from '@/components/f/page-foot';
import { SiteHeader } from '@/components/f/site-header';
import { SkipLink } from '@/components/f/skip-link';
import { HeaderHeight } from '@/components/header-height';

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${newsreader.variable} ${geistSans.variable} ${geistMono.variable}`}
    >
      <body>
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

          {/* C-04. The two outer strings are per-screen copy; each screen
              passes its own as M4 to M6 rebuild it. */}
          <PageFoot />
        </div>
      </body>
    </html>
  );
}
