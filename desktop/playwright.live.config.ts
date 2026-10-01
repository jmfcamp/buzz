import { defineConfig } from "@playwright/test";

import { applyPlaywrightNodeCollect } from "./playwright-node-collect.mjs";

const config = defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/agents-everywhere.live.spec.ts",
  timeout: 90_000,
  workers: 1,
  reporter: "list",
});

export default applyPlaywrightNodeCollect(config);
