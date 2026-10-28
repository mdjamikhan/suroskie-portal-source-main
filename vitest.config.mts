import { defineConfig } from "vitest/config";
import path from "node:path";

const alias = {
  "@": path.resolve(import.meta.dirname, "src"),
  // Next's "server-only" guard throws outside the React server runtime; tests are server-side by definition.
  "server-only": path.resolve(import.meta.dirname, "tests/helpers/empty.ts"),
};

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      { extends: true, test: { name: "unit", include: ["tests/unit/**/*.test.ts"], environment: "node", setupFiles: ["tests/helpers/test-env.ts"] } },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          setupFiles: ["tests/helpers/test-env.ts"],
          globalSetup: ["tests/helpers/global-db.ts"],
          fileParallelism: false,
          testTimeout: 60_000,
          hookTimeout: 60_000,
        },
      },
      {
        extends: true,
        test: {
          name: "e2e",
          include: ["tests/e2e/**/*.test.ts"],
          environment: "node",
          setupFiles: ["tests/helpers/test-env.ts"],
          globalSetup: ["tests/helpers/global-e2e.ts"],
          fileParallelism: false,
          testTimeout: 120_000,
          hookTimeout: 600_000,
        },
      },
    ],
  },
});
