import 'server-only';

/**
 * Administrator identity for the MCP consent screen.
 *
 * The OAuth authorize endpoint has to know *who* is approving a connector
 * before it will mint an authorization code. Identity comes from Neon Auth
 * — the same provider that backs the database this repository runs on — so
 * there is no second account system to provision, and the session cookie is
 * managed by `@neondatabase/auth` rather than by this file.
 *
 * Being signed in is necessary but not sufficient: Neon Auth will happily
 * create an account for anyone who reaches the hosted sign-in page. The
 * `ALLOWED_EMAILS` allow-list is what actually decides who may approve a
 * connector, and an empty list means nobody can — a deployment that forgets
 * to set it fails closed.
 *
 * The OAuth 2.1 + DCR + PKCE flow that claude.ai requires is unaffected;
 * this module only answers "is an authorised administrator present?".
 */
import { auth, isNeonAuthConfigured } from '@/lib/neon-auth';

export interface AdminUser {
  userId: string;
  email: string | null;
}

function allowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * True when the admin gate is configured at all: a working Neon Auth
 * instance *and* at least one address permitted to use it.
 */
export function isAdminConfigured(): boolean {
  return isNeonAuthConfigured() && allowedEmails().length > 0;
}

/** Whether a signed-in address is permitted to approve connectors. */
export function isAllowedAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return allowedEmails().includes(email.trim().toLowerCase());
}

/**
 * The signed-in user, whoever they are. Callers that need authorisation as
 * well as authentication want `getAdminUser()`; this exists so the consent
 * screen can tell "not signed in" (bounce to sign-in) apart from "signed in
 * as somebody else" (a dead end that signing in again will not fix).
 */
export async function getSignedInUser(): Promise<AdminUser | null> {
  try {
    const { data } = await auth.getSession();
    const user = data?.user;
    if (!user?.id) return null;
    return { userId: user.id, email: user.email?.toLowerCase() ?? null };
  } catch {
    return null;
  }
}

/** The signed-in administrator, or null. */
export async function getAdminUser(): Promise<AdminUser | null> {
  const user = await getSignedInUser();
  if (!user) return null;
  return isAllowedAdmin(user.email) ? user : null;
}
