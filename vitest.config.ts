import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Vitest runs the pure logic that drives real agent actions — scoring, the
 * journeys matcher, segmentation parsing. These have no DB or network deps, so
 * the suite is fast and runs anywhere (CI, pre-push, Vercel ignored-build).
 *
 * The `@/` alias mirrors tsconfig's paths so test imports match app imports.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    include: ["lib/**/*.test.ts"],
    environment: "node",
  },
});
