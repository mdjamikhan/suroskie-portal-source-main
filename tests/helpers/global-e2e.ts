// E2E harness: production build + `next start` against the test database and the mock Graph API.
import { execSync, spawn, type ChildProcess } from "node:child_process";
import { startMockMeta } from "../mock-meta/server";
import { TEST_DB } from "./test-env";

const PORT = 3100;
const MOCK_PORT = 4010;
let server: ChildProcess | undefined;
let mock: Awaited<ReturnType<typeof startMockMeta>> | undefined;

export async function setup() {
  if (!/suroskie_test/.test(TEST_DB)) throw new Error("Refusing to run e2e tests against a non-test database");
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: TEST_DB }, stdio: "pipe" });
  if (!process.env.E2E_SKIP_BUILD) execSync("npx next build", { stdio: "inherit", env: { ...process.env, NODE_ENV: "production" } });
  mock = await startMockMeta({ port: MOCK_PORT });
  server = spawn("npx", ["next", "start", "-p", String(PORT)], {
    env: { ...process.env, NODE_ENV: "production", META_GRAPH_BASE_URL: mock.url, PORT: String(PORT) },
    stdio: process.env.E2E_VERBOSE ? "inherit" : "ignore",
    detached: true,
  });
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`http://localhost:${PORT}/login`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("next start did not become ready");
}

export async function teardown() {
  if (server?.pid) {
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {}
  }
  await mock?.close();
}
