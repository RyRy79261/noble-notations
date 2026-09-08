import type { Metadata } from 'next';
import Link from 'next/link';
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

import { BasketButton } from '@/components/shopping-basket';
import { HeaderHeight } from '@/components/header-height';

const NAV = [
  { href: '/recipes', label: 'Recipes' },
  { href: '/cuisines', label: 'Cuisines' },
  { href: '/categories', label: 'Categories' },
  { href: '/ingredients', label: 'Ingredients' },
  { href: '/shopping-list', label: 'Shopping' },
  { href: '/experiments', label: 'Experiments' },
  { href: '/archive', label: 'Archive' },
  { href: '/search', label: 'Search' },
];

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${newsreader.variable} ${geistSans.variable} ${geistMono.variable}`}
    >
      <body>
        <div className="shell">
          <a className="skip-link" href="#main">
            Skip to content
          </a>
          <header className="site-header">
            <div className="site-header-inner">
              <Link href="/" className="brand">
                <span aria-hidden>◆</span> {site.name}
              </Link>
              {/* Outside the nav on purpose: the nav scrolls sideways on a
                  phone, which used to park this off the right edge. */}
              <BasketButton />
              <nav className="site-nav" aria-label="Primary">
                {NAV.map((item) => (
                  <Link key={item.href} href={item.href}>
                    {item.label}
                  </Link>
                ))}
              </nav>
            </div>
          </header>

          {/* Anything that must clear the sticky header reads --header-h,
              because the header's height depends on content, not width. */}
          <HeaderHeight />

          {/* tabIndex so "Skip to content" actually moves focus. Without it
              only Chromium's sequential-focus fallback papers over the gap
              and Safari does nothing at all. */}
          <main id="main" tabIndex={-1}>
            {children}
          </main>

          <footer className="site-footer">
            <div className="site-footer-inner">
              <span>
                © {new Date().getFullYear()} {site.name}. Notes on food, kept
                properly.
              </span>
              <span className="row">
                <Link href="/connect">MCP connector</Link>
                <a href={site.repository} rel="noreferrer">
                  Source
                </a>
              </span>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
