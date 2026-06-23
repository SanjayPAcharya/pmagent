import { execSync } from 'node:child_process'
import { PrismaClient } from '@prisma/client'

const ADMIN_URL =
  process.env.TEST_ADMIN_URL ?? 'postgresql://agentpm:localdev@localhost:5432/agentpm'
const TEST_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://agentpm:localdev@localhost:5432/agentpm_test'

// Runs once before the whole suite: ensure the test DB exists, then migrate it.
export default async function setup() {
  const admin = new PrismaClient({ datasourceUrl: ADMIN_URL })
  try {
    await admin.$executeRawUnsafe('CREATE DATABASE agentpm_test')
  } catch {
    // already exists — fine
  } finally {
    await admin.$disconnect()
  }

  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: TEST_URL },
  })
}
