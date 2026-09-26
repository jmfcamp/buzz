import assert from "node:assert/strict";
import { test } from "node:test";

import {
  matchPinnedSiteForUrl,
  scorePinnedSiteMatch,
} from "./matchPinnedSite.ts";

const pins = [
  {
    id: "docs",
    name: "Docs",
    url: "https://docs.example.com/guide",
    icon: "book-open",
    pollForChanges: false,
    scope: "personal",
  },
  {
    id: "root",
    name: "Example",
    url: "https://www.example.com",
    icon: "globe",
    pollForChanges: false,
    scope: "personal",
  },
  {
    id: "app",
    name: "App",
    url: "https://app.example.com/dashboard",
    icon: "layout-dashboard",
    pollForChanges: false,
    scope: "personal",
  },
];

test("prefers longer path pin over domain-only pin", () => {
  const match = matchPinnedSiteForUrl(
    "https://docs.example.com/guide/intro",
    pins,
  );
  assert.equal(match?.id, "docs");
});

test("domain-only pin matches sibling paths on same host", () => {
  const match = matchPinnedSiteForUrl("https://example.com/blog/post", pins);
  assert.equal(match?.id, "root");
});

test("www is ignored for hostname matching", () => {
  assert.ok(scorePinnedSiteMatch("https://www.example.com/x", "https://example.com") > 0);
  assert.ok(scorePinnedSiteMatch("https://example.com/x", "https://www.example.com") > 0);
});

test("unrelated host returns null", () => {
  assert.equal(matchPinnedSiteForUrl("https://other.test/page", pins), null);
});

test("more specific dashboard pin wins over weaker domain", () => {
  const withDomain = [
    ...pins,
    {
      id: "app-root",
      name: "App root",
      url: "https://app.example.com",
      icon: "globe",
      pollForChanges: false,
      scope: "personal",
    },
  ];
  const match = matchPinnedSiteForUrl(
    "https://app.example.com/dashboard/settings",
    withDomain,
  );
  assert.equal(match?.id, "app");
});
