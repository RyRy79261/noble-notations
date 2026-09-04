/**
 * Connector scopes.
 *
 * Read and write are separate so the consent screen can say plainly which
 * one is being granted — this connector can create and revise recipes, which
 * is not something to hand over implicitly.
 */
export const SUPPORTED_SCOPES = [
  'noble-notations:read',
  'noble-notations:write',
] as const;
export type Scope = (typeof SUPPORTED_SCOPES)[number];

export const READ_SCOPE: Scope = 'noble-notations:read';
export const WRITE_SCOPE: Scope = 'noble-notations:write';

/** Unrecognised scopes are dropped; an empty request falls back to read. */
export function parseScopeString(scope: string | null | undefined): Scope[] {
  if (!scope) return [READ_SCOPE];
  const requested = scope.split(/\s+/).filter(Boolean);
  const allowed = requested.filter((s): s is Scope =>
    (SUPPORTED_SCOPES as readonly string[]).includes(s),
  );
  return allowed.length > 0 ? allowed : [READ_SCOPE];
}

export function serialiseScopes(scopes: Scope[]): string {
  return scopes.join(' ');
}

export function hasScope(granted: string, required: Scope): boolean {
  return granted.split(/\s+/).includes(required);
}
