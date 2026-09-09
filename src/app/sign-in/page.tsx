import { Suspense } from 'react';
import type { Metadata } from 'next';

import { isAdminConfigured } from '@/lib/mcp/admin-session';
import { Warning } from '@/components/f/note';
import { Notice } from '@/components/f/notice';
import { PageHead, PageHero } from '@/components/f/page-head';
import { Section360 } from '@/components/f/section-label';

import { SignInForm } from './sign-in-form';

export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * `/sign-in` — the one sign-in surface on the site. `access-1280.html:1583`,
 * at 360 in `m360-access-science.html:694`. The pictures are
 * `design/exports/png/rND4B.png` and `huSrx.png`.
 *
 * Nothing here is behind a login — the recipes, categories and archive are
 * public. This page exists so the MCP consent screen has a signed-in
 * administrator to attribute an approval to, and the authorize route sends
 * people here with `?callbackURL=` pointing back at itself. `SignInForm`
 * reads that param with `useSearchParams()`, which has to sit inside a
 * Suspense boundary or the page cannot be prerendered.
 *
 * R-SCR-26: low traffic, and it must not look unfinished. The design gives
 * it the centred 520px column the `/connect/done` screen uses at 620 — a
 * hero, the form, a notice and one line of small print — and at 360 it gains
 * an `F/Section 360` head over the form that 1280 does not draw.
 *
 * THE SESSION LINE IS NOT THE DESIGN'S. The design writes `THE SESSION LASTS
 * THIRTY DAYS` beside the button. Nothing in this deployment sets a session
 * length: `createNeonAuth` is given a base URL and a cookie secret and
 * nothing else (`src/lib/neon-auth.ts`), so thirty days is a number no code
 * here would honour. The slot says what is true instead.
 */
export default function AuthPage() {
  const configured = isAdminConfigured();

  return (
    <>
      <PageHead left="NN · Sign in" right="Administrator only · one account" />

      {/* `Main` for a centred screen: `p-[ 96px 60px 120px 60px ]` and
          `items-center` at 1280 over a 520px column, the ordinary
          22/16/48/16 at 360. */}
      <div className="flex w-full flex-col items-start gap-7 px-4 pt-5.5 pb-12 shell:items-center shell:gap-10 shell:px-15 shell:pt-24 shell:pb-30">
        <div className="flex w-full flex-col items-start gap-7 shell:w-130">
          <PageHero
            kicker="Section VII · Access"
            kickerForm="mark"
            title="Administrator sign in"
            lede="Reading needs no account. This page exists only so that the one person who keeps the catalogue can add to it."
          />

          {/* The 360 head over the form. The design draws no section head at
              1280, so this one is `display:none` there rather than folded
              into an F/Section label. */}
          <Section360
            className="shell:hidden"
            label="Sign in"
            meta="One account"
          />

          {configured ? (
            <Suspense fallback={null}>
              <SignInForm />
            </Suspense>
          ) : (
            /* R-STA-02's shape for a deployment that cannot complete a
               sign-in at all: the failure is stated where the control would
               be, rather than under a form that could never work. */
            <Warning role="alert" title="No administrator is configured">
              This deployment has no administrator identity. Set{' '}
              <code className="[font-size:inherit] font-mono">
                NEON_AUTH_BASE_URL
              </code>
              ,{' '}
              <code className="[font-size:inherit] font-mono">
                NEON_AUTH_COOKIE_SECRET
              </code>{' '}
              and{' '}
              <code className="[font-size:inherit] font-mono">
                ALLOWED_EMAILS
              </code>
              . Reading needs none of them and is unaffected.
            </Warning>
          )}

          <Notice title="Reading needs no account">
            Every recipe, revision, run, tag and archived note on this site is
            public and asks nothing of you. Nothing is held back behind this
            form. Signing in only turns on the tools that add to the record, and
            the record can only be added to.
          </Notice>

          <span className="text-09 leading-170 font-mono tracking-label uppercase text-ink-3">
            One administrator · no public accounts · no comments · no tracking
          </span>
        </div>
      </div>
    </>
  );
}
