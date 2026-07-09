import { prisma } from '../db/client.js'

export interface AuditEntry {
  orgId?: string | null
  actorId?: string | null
  action: string
  targetType: string
  targetId?: string | null
  meta?: object
}

/**
 * Record a security-relevant action. Fire-and-forget: an audit failure must
 * never fail the caller's request, so errors are swallowed (logged to stderr
 * since there's no request-scoped logger here).
 */
export async function audit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        orgId: entry.orgId ?? null,
        actorId: entry.actorId ?? null,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId ?? null,
        meta: entry.meta,
      },
    })
  } catch (err) {
    console.error('[audit] failed to record entry', entry.action, err)
  }
}
