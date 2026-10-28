// Deterministic, non-secret configuration for automated tests. Never real credentials.
export const TEST_DB = process.env.TEST_DATABASE_URL ?? "postgresql://suroskie:suroskie_dev@localhost:5432/suroskie_test?schema=public";

Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: TEST_DB,
  APP_URL: process.env.E2E_APP_URL ?? "http://localhost:3100",
  BETTER_AUTH_URL: process.env.E2E_APP_URL ?? "http://localhost:3100",
  BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-0123456789",
  TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  CRON_SECRET: "test-cron-secret-test-cron-secret-0123456789",
  META_APP_ID: "1234567890",
  META_APP_SECRET: "test-app-secret",
  META_API_VERSION: "v24.0",
  DEMO_MODE: "false",
});
