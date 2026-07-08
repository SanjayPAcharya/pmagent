import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildServer } from '../index'
import { signToken } from './auth-test-kit'
import { prisma } from '../db/client'
import { purgeExpired } from '../services/retention.service'

// Data-retention sweep (Phase 3.7.4 E2). Own file, same pattern as the other
// 3.7.4 suites.
let app: FastifyInstance
beforeAll(async () => {
  app = await buildServer()
})
afterAll(async () => {
  await app.close()
})

const bearer = (t: string) => ({ authorization: `Bearer ${t}` })
const tokenFor = (sub: string) => signToken({ sub, email: `${sub}@x.com`, name: sub })
const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000)

describe('purgeExpired', () => {
  it('removes stale read notifications + long-expired unaccepted invites, keeps the rest', async () => {
    const owner = await tokenFor('ret-owner')
    const orgRes = await app.inject({ method: 'POST', url: '/api/orgs', headers: bearer(owner), payload: { name: 'Retention Co' } })
    const orgId = orgRes.json().org.id as string
    const meRes = await app.inject({ method: 'GET', url: '/api/me', headers: bearer(owner) })
    const userId = meRes.json().user.id as string

    // Stale: read + 120 days old → should be purged.
    const staleNotif = await prisma.notification.create({
      data: { userId, type: 'MENTION', body: 'old read', readAt: daysAgo(120), createdAt: daysAgo(120) },
    })
    // Kept: read but recent.
    const recentNotif = await prisma.notification.create({
      data: { userId, type: 'MENTION', body: 'recent read', readAt: daysAgo(1), createdAt: daysAgo(1) },
    })
    // Kept: old but UNREAD.
    const unreadNotif = await prisma.notification.create({
      data: { userId, type: 'MENTION', body: 'old unread', readAt: null, createdAt: daysAgo(120) },
    })
    // Stale: unaccepted + expired 40 days ago → should be purged.
    const staleInvite = await prisma.orgInvite.create({
      data: { orgId, token: 'ret-stale-token', invitedById: userId, role: 'MEMBER', expiresAt: daysAgo(40), acceptedAt: null },
    })
    // Kept: unaccepted but only recently expired (within the 30-day grace).
    const freshInvite = await prisma.orgInvite.create({
      data: { orgId, token: 'ret-fresh-token', invitedById: userId, role: 'MEMBER', expiresAt: daysAgo(5), acceptedAt: null },
    })

    const result = await purgeExpired()
    expect(result.notifications).toBeGreaterThanOrEqual(1)
    expect(result.invites).toBeGreaterThanOrEqual(1)

    expect(await prisma.notification.findUnique({ where: { id: staleNotif.id } })).toBeNull()
    expect(await prisma.notification.findUnique({ where: { id: recentNotif.id } })).not.toBeNull()
    expect(await prisma.notification.findUnique({ where: { id: unreadNotif.id } })).not.toBeNull()
    expect(await prisma.orgInvite.findUnique({ where: { id: staleInvite.id } })).toBeNull()
    expect(await prisma.orgInvite.findUnique({ where: { id: freshInvite.id } })).not.toBeNull()
  })
})
