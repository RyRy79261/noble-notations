import 'server-only';

/**
 * Per-tool-call audit trail.
 *
 * Fire-and-forget: the caller already has its answer, and a logging failure
 * must never turn a successful tool call into an error.
 *
 * Free-form text (note bodies, recipe summaries) is never logged — callers
 * pass `argsForAudit` containing only the identifying primitives, so the log
 * says "revised `dan-dan-noodles`" rather than reproducing the whole recipe.
 */
import { db } from '@/db/client';
import { mcpAuditLog } from '@/db/schema';

export interface AuditEvent {
  userId: string;
  clientId: string;
  tool: string;
  argsForAudit: Record<string, unknown> | null;
  status: 'success' | 'error';
  errorMessage?: string | null;
  durationMs?: number;
}

export async function writeMcpAudit(event: AuditEvent): Promise<void> {
  try {
    await db.insert(mcpAuditLog).values({
      userId: event.userId,
      clientId: event.clientId,
      tool: event.tool,
      argsJson: event.argsForAudit ? JSON.stringify(event.argsForAudit) : null,
      status: event.status,
      errorMessage: event.errorMessage ?? null,
      durationMs: event.durationMs ?? null,
    });
  } catch (err) {
    console.warn('[mcp] failed to write audit log', err);
  }
}
