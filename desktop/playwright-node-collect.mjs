import { fileURLToPath } from "node:url";

import "./playwright-css-register.mjs";

const pluginPath = fileURLToPath(
  new URL("./playwright-import-meta-env.cjs", import.meta.url),
);

/**
 * Teach Playwright's Node collector about Vite-only imports.
 * Stylesheets stay external so Babel does not parse them. The Babel plugin
 * rewrites `import.meta.env` inside the test process. The browser bundle is
 * unchanged.
 *
 * @param {import("@playwright/test").PlaywrightTestConfig} config
 */
export function applyPlaywrightNodeCollect(config) {
  config["@playwright/test"] = {
    babelPlugins: [[pluginPath]],
  };
  return config;
}
