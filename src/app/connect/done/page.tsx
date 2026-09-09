import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { getSignedInUser } from '@/lib/mcp/admin-session';
import { site } from '@/lib/site';
import { cn } from '@/lib/utils';
import { buttonClasses } from '@/components/f/button';
import { Mark } from '@/components/f/mark';
import { Notice } from '@/components/f/notice';
import { PageHead, PageHero } from '@/components/f/page-head';

import { OAuthReturn } from './oauth-return';

export const metadata: Metadata = {
  title: 'Signing in',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * `/connect/done` — the landing point for Neon Auth's hosted sign-in, drawn
 * as the design's "agent connected" screen. `access-1280.html:1210`, at 360
 * in `m360-access-science.html:955`. The pictures are
 * `design/exports/png/IrnVT.png` and `R67YU.png`.
 *
 * THE BEHAVIOUR IS UNCHANGED AND THIS ONLY RESTYLES IT. The hosted flow
 * returns here with `?neon_auth_session_verifier=…`, which `auth.middleware()`
 * swaps for a real session cookie and then redirects back to this same path
 * with the param stripped. That second load is what renders: by then the
 * cookie exists, and all this page has to do is forward to wherever sign-in
 * was headed. `OAuthReturn` still does exactly that.
 *
 * It lives outside `/sign-in` on purpose — the middleware skips its exchange
 * for any path at or under the configured login path. See
 * `src/lib/auth-routes.ts`.
 *
 * WHAT THE DETAILS BLOCK HOLDS, AND WHY IT IS THREE ROWS AND NOT FIVE. The
 * design draws AGENT, GRANTED, SIGNED IN AS, AT and SESSION. Three of those
 * five are facts about an OAuth grant that this page is not part of: the
 * consent screen is at `/api/mcp/oauth/authorize`, it is where a client name
 * and a scope are known, and this page is the *sign-in* leg in front of it.
 * Writing "Claude Code · read and write · thirty days" here would be a
 * screen inventing a record of something it did not witness — the same
 * ruling D-12 makes about the figures the design draws and the data does not
 * hold. The three rows below are each read from something real: the session,
 * `site.url`, and the destination the return trip is carrying.
 */
export default async function OAuthReturnPage() {
  /* Server-side, and already `force-dynamic`. `getSignedInUser` returns null
     rather than throwing when Neon Auth is not configured, so an unconfigured
     deployment draws the screen with one row fewer. */
  const user = await getSignedInUser();

  return (
    <>
      <PageHead left="NN · Connect" right="Handshake complete" />

      {/* `Main` for a centred screen: `p-[ 96px 60px 120px 60px ]` and
          `items-center` at 1280, the ordinary 22/16/48/16 at 360. The column
          inside it is 620px. */}
      <div className="flex w-full flex-col items-start gap-7 px-4 pt-5.5 pb-12 shell:items-center shell:gap-10 shell:px-15 shell:pt-24 shell:pb-30">
        <div className="flex w-full flex-col items-start gap-7 shell:w-155">
          <Mark>Connected</Mark>

          <PageHero
            title="The handshake is complete"
            lede="You can close this tab. The connection lives with the agent from here on, not with this window, and nothing on this page needs to stay open for it to keep working."
          />

          {/* The details block: a `f-desk` ground, rows 9px apart on the
              block axis, an `f-hair` rule between them and none above the
              first. */}
          <dl className="m-0 flex w-full flex-col items-start gap-0 bg-desk px-4 py-3 shell:px-5 shell:py-4.5">
            {user?.email ? <Row label="Signed in as">{user.email}</Row> : null}
            <Row label="Endpoint">{site.url}/api/mcp/mcp</Row>
            <Row label="Continuing to">
              {/* The one client component on this screen, and it is the one
                  that was here before: it reads `next` and performs the hard
                  navigation. `useSearchParams` has to sit inside a Suspense
                  boundary or the page cannot be prerendered. */}
              <Suspense fallback={null}>
                <OAuthReturn />
              </Suspense>
            </Row>
          </dl>

          <Notice title="Closing this tab changes nothing">
            This page was only where the handshake happened. To stop the agent
            reading, remove the server from its configuration; to stop it
            writing, sign in here and end the session. Anything it has already
            written stays on the record either way.
          </Notice>

          <Link
            href="/"
            className={buttonClasses('primary', 'w-full shell:w-fit')}
          >
            Back to the catalogue
          </Link>
        </div>
      </div>
    </>
  );
}

/**
 * One key-and-value row of the details block. 92px of key at 360, 130px at
 * 1280; a 9px tracked mono label and a 12px mono value.
 *
 * `<dl>`/`<dt>`/`<dd>` rather than four divs: this is a list of terms and
 * their values, and the design's own K/V naming says so. The `m-0` on the
 * `dd` was load-bearing while Tailwind's preflight was OFF, up to M7 — the
 * user agent gives a `dd` `margin-inline-start: 40px`. Since M7 the
 * preflight's `* { margin: 0 }` takes it, so the class is belt-and-braces
 * and is kept for that reason.
 */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        'flex w-full shrink-0 flex-row items-center gap-3 py-2.25 shell:gap-4',
        '[border-style:solid] [border-width:1px_0px_0px_0px] border-t-hair',
        'first:[border-width:0px_0px_0px_0px]',
      )}
    >
      <dt className="w-23 shrink-0 text-09 leading-normal font-mono tracking-label uppercase text-ink-3 shell:w-32.5">
        {label}
      </dt>
      {/* R-CMP-14's real space: a flex gap is invisible to `textContent`, so
          without it the row reads "SIGNED IN ASryan@…" to a screen reader
          and to a copy-paste. */}{' '}
      <dd className="m-0 min-w-0 flex-1 text-12 leading-150 font-mono break-all text-ink">
        {children}
      </dd>
    </div>
  );
}
