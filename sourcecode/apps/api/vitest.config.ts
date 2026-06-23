import { defineConfig } from 'vitest/config'

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://agentpm:localdev@localhost:5432/agentpm_test'

export default defineConfig({
  test: {
    globalSetup: ['./src/test/global-setup.ts'],
    setupFiles: ['./src/test/setup.ts'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: TEST_DATABASE_URL,
    },
    // DB is shared across files — run files sequentially to avoid cross-test races.
    fileParallelism: false,
    hookTimeout: 30_000,
  },
})
