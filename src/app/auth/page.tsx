import type { Metadata } from 'next';
import { getAdminUser } from '@/lib/mcp/admin-session';
import { SignInForm } from './sign-in-form';

export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

function safeCallback(raw: string | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackURL?: string }>;
}) {
  const params = await searchParams;
  const callbackURL = safeCallback(params.callbackURL);
  const user = await getAdminUser();

  return (
    <main className="prose-page narrow">
      <h1>Administrator sign-in</h1>
      {user ? (
        <>
          <p className="muted">
            You are signed in. Continue to{' '}
            <a href={callbackURL}>{callbackURL}</a>.
          </p>
        </>
      ) : (
        <>
          <p className="muted">
            Signing in is only needed to approve an MCP connector. The site
            itself is public and needs no account.
          </p>
          <SignInForm callbackURL={callbackURL} />
        </>
      )}
    </main>
  );
}
