import { defineConfig, devices } from "@playwright/test";

import { applyPlaywrightNodeCollect } from "./playwright-node-collect.mjs";

const config = defineConfig({
  build: {
    external: ["**/*.css"],
  },
  testDir: "./tests/e2e",
  timeout: 60_000,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: "http://127.0.0.1:4173" },
  projects: [
    {
      name: "perf",
      testMatch: ["**/*.perf.ts"],
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "python3 -m http.server 4173 -d dist",
    cwd: ".",
    reuseExistingServer: true,
    url: "http://127.0.0.1:4173",
  },
});

export default applyPlaywrightNodeCollect(config);
