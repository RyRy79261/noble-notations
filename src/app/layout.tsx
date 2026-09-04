import type { Metadata } from 'next';
import Link from 'next/link';
import { site } from '@/lib/site';
import './globals.css';

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
    <html lang="en">
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
              <nav className="site-nav" aria-label="Primary">
                {NAV.map((item) => (
                  <Link key={item.href} href={item.href}>
                    {item.label}
                  </Link>
                ))}
                <BasketButton />
              </nav>
            </div>
          </header>

          <main id="main">{children}</main>

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
