import { register } from "node:module";

const hookUrl = new URL("./playwright-css-hook.mjs", import.meta.url);
register(hookUrl);

// The out-of-process loader and the test workers are new Node processes.
// They inherit NODE_OPTIONS and register this hook at startup. Playwright
// registers its own loader afterwards and calls this hook for files it does
// not transform (stylesheets, JSON, images).
const flag = `--import ${hookUrl.href}`;
if (!process.env.NODE_OPTIONS?.includes(hookUrl.href)) {
  process.env.NODE_OPTIONS = [process.env.NODE_OPTIONS, flag]
    .filter(Boolean)
    .join(" ");
}
