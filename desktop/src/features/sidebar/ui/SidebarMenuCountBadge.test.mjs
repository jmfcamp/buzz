import assert from "node:assert/strict";
import test from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SidebarMenuCountBadge } from "./SidebarMenuCountBadge.tsx";

test("SidebarMenuCountBadge renders when preference is on including zero", () => {
  const html = renderToStaticMarkup(
    createElement(SidebarMenuCountBadge, {
      count: 0,
      preferenceEnabled: true,
      testId: "sidebar-browsers-count",
    }),
  );
  assert.match(html, /data-testid="sidebar-browsers-count"/);
  assert.match(html, />0</);
});

test("SidebarMenuCountBadge hides roster zero when preference is off", () => {
  const html = renderToStaticMarkup(
    createElement(SidebarMenuCountBadge, {
      count: 0,
      preferenceEnabled: false,
      testId: "sidebar-agents-count",
    }),
  );
  assert.equal(html, "");
});

test("SidebarMenuCountBadge keeps legacy inbox chip when preference is off", () => {
  const html = renderToStaticMarkup(
    createElement(SidebarMenuCountBadge, {
      count: 4,
      preferenceEnabled: false,
      legacyWhenPositive: true,
      testId: "sidebar-home-count",
    }),
  );
  assert.match(html, /data-testid="sidebar-home-count"/);
  assert.match(html, />4</);
});

test("SidebarMenuCountBadge renders agents running/total string", () => {
  const html = renderToStaticMarkup(
    createElement(SidebarMenuCountBadge, {
      count: "3/12",
      preferenceEnabled: true,
      testId: "sidebar-agents-count",
    }),
  );
  assert.match(html, /data-testid="sidebar-agents-count"/);
  assert.match(html, />3\/12</);
});
