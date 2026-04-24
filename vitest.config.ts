/**
 * Vitest configuration for pi-presets-plus.
 *
 * Test files live under `tests/` and use the `*.test.ts` suffix. Vitest
 * picks up the strict TypeScript settings from `tsconfig.json` via Vite's
 * built-in TS transform; no extra build step is needed.
 *
 * `globals: false` keeps the test files explicit (no ambient `describe`/`it`)
 * which matches the strict imports used elsewhere in the project.
 */

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["tests/**/*.test.ts"],
  },
});
