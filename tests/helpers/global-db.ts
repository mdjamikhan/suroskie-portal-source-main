import { execSync } from "node:child_process";
import { TEST_DB } from "./test-env";

/** Apply migrations to the dedicated test database (never the dev database). */
export default function setup() {
  if (!/suroskie_test/.test(TEST_DB)) throw new Error("Refusing to run integration tests against a non-test database");
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: TEST_DB }, stdio: "pipe" });
}
