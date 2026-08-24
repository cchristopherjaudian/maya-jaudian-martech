import { defineConfig } from 'vitest/config';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://martech_user:martech_pass@localhost:5432/martech_test_db';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.integration.test.ts'],
    exclude: ['node_modules', 'dist'],
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      NODE_ENV: 'test',
      PORT: '3000',
      LOG_LEVEL: 'error',
    },
    globalSetup: ['./tests/global-setup.ts'],
    setupFiles: ['./tests/setup.ts'],
    // Integration tests share one Postgres instance; run them in a single
    // worker/sequentially so concurrent transactions don't cross-pollute
    // each other's daily/monthly limit aggregations.
    fileParallelism: false,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
