import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

const TEST_DB_URL =
  process.env.DATABASE_URL_TEST ??
  "postgresql://postgres:postgres@localhost:5433/atlas_test";

export default defineConfig({
  // react() supplies the JSX transform: the tRPC router transitively imports the
  // emails/*.tsx templates, and Next's tsconfig sets jsx:"preserve", so esbuild
  // alone would leave JSX unparsed. Matches vitest.config.ts.
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: "node",
    globals: true,
    include: ["**/*.integration.test.ts"],
    exclude: ["**/node_modules/**", ".next", ".claude/**"],
    globalSetup: ["./db/test/globalSetup.ts"],
    env: { DATABASE_URL: TEST_DB_URL, DATABASE_URL_TEST: TEST_DB_URL },
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 120000,
  },
});
