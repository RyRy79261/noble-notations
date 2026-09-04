'use client';

/**
 * Browser-side Neon Auth client.
 *
 * `createAuthClient` passes its first argument straight through as Better
 * Auth's `baseURL`; leaving it undefined makes the client talk to this
 * origin's own `/api/auth/*` mount, which is what `auth.handler()` serves.
 */
import { createAuthClient } from '@neondatabase/auth';
import { BetterAuthReactAdapter } from '@neondatabase/auth/react/adapters';

const authClient = createAuthClient(undefined as unknown as string, {
  adapter: BetterAuthReactAdapter(),
});

export const { signIn, signOut, useSession } = authClient;
