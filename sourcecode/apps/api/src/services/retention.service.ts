import { prisma } from '../db/client.js'
import { loadConfig } from '../config.js'

// 3.7.4 E2 — scheduled data retention. Deletes stale rows that carry no lasting
// value and would otherwise accumulate personal data indefinitely:
//   • read notifications older than RETENTION_NOTIFICATION_DAYS (default 90)
//   • invites that were never accepted and expired > 30 days ago
// Deliberately NOT touched: archived tickets/projects (kept forever by owner
// decision), audit rows (compliance evidence), and UNREAD notifications.

const INVITE_GRACE_MS = 30 * 24 * 60 * 60 * 1000

export async function purgeExpired(now = new Date()): Promise<{ notifications: number; invites: number }> {
  const { RETENTION_NOTIFICATION_DAYS } = loadConfig()
  const notificationCutoff = new Date(now.getTime() - RETENTION_NOTIFICATION_DAYS * 24 * 60 * 60 * 1000)
  const inviteCutoff = new Date(now.getTime() - INVITE_GRACE_MS)

  const [notifications, invites] = await prisma.$transaction([
    prisma.notification.deleteMany({
      where: { readAt: { not: null }, createdAt: { lt: notificationCutoff } },
    }),
    prisma.orgInvite.deleteMany({
      where: { acceptedAt: null, expiresAt: { lt: inviteCutoff } },
    }),
  ])
  return { notifications: notifications.count, invites: invites.count }
}
