/**
 * Catch-all Neon Auth mount.
 *
 * Proxies every Neon Auth endpoint the browser client calls —
 * `/api/auth/sign-in/email`, `/api/auth/sign-in/social`,
 * `/api/auth/get-session`, `/api/auth/sign-out` and the rest — translating
 * the upstream session into cookies on this origin.
 *
 * Public by necessity: it is how a session comes into existence. The MCP
 * endpoints do their own bearer-token checks, and the site itself needs no
 * account at all.
 */
import { auth } from '@/lib/neon-auth';

export const { GET, POST, PUT, DELETE, PATCH } = auth.handler();
