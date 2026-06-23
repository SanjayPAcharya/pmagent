import { beforeAll, afterAll, beforeEach } from 'vitest'
import { prisma } from '../db/client'
import { startTestAuth, stopTestAuth } from './auth-test-kit'

// Runs in each test worker before the test file. Starts the hermetic auth
// stand-in (sets KEYCLOAK_* env) BEFORE any buildServer() call in the file,
// and truncates the shared test DB between tests.
beforeAll(async () => {
  await startTestAuth()
})

afterAll(async () => {
  await stopTestAuth()
  await prisma.$disconnect()
})

beforeEach(async () => {
  await prisma.$transaction([
    prisma.orgMember.deleteMany(),
    prisma.project.deleteMany(),
    prisma.organization.deleteMany(),
    prisma.user.deleteMany(),
  ])
})
