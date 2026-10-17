import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const tsx = readFileSync(new URL("./PhoneTabBar.tsx", import.meta.url), "utf8");
const css = readFileSync(
  new URL("../../shared/styles/globals/phone.css", import.meta.url),
  "utf8",
);

test("tab bar has no hardcoded dark-only colours in markup (theme comes from phone.css)", () => {
  assert.doesNotMatch(tsx, /text-white/);
  assert.doesNotMatch(tsx, /border-zinc-/);
});

test("light theme gets its own frosted tab bar with accent-coloured selected tab", () => {
  const light = css.match(
    /\[data-phone\]:not\(\.dark\) \.phone-tabbar \{([^}]*)\}/,
  );
  assert.ok(light, "light tab bar rule present");
  assert.match(light[1], /--phone-tab-active-fg: var\(--phone-chrome-accent\)/);
  assert.match(
    light[1],
    /background: color-mix\(in srgb, hsl\(var\(--background\)/,
  );
  assert.match(
    css,
    /\.phone-tab\[aria-current="page"\] \{\s*color: var\(--phone-tab-active-fg\);/,
  );
});

test("nav row and tab-count pill use the shared chrome accent in light and dark", () => {
  assert.match(
    css,
    /\[data-phone\]:not\(\.dark\) \{[^}]*--phone-chrome-accent: color-mix\(in srgb, hsl\(var\(--primary\)\)/,
  );
  assert.match(
    css,
    /\.phone-nav-button \{\s*color: var\(--phone-chrome-accent\);/,
  );
  const pill = css.match(/\.phone-tab-switcher-button \{([^}]*)\}/);
  assert.match(pill[1], /color: var\(--phone-chrome-accent\)/);
});
