import assert from "node:assert/strict";
import test from "node:test";

import {
  joinPlaygroundUrl,
  playgroundAddressNavigation,
  splitLockedPlaygroundUrl,
  suffixFromCurrentUrl,
} from "./addressBar.ts";

test("locks the start URL through its last path slash", () => {
  assert.deepEqual(splitLockedPlaygroundUrl("https://app.example.com"), {
    prefix: "https://app.example.com/",
    suffix: "",
  });
  assert.deepEqual(splitLockedPlaygroundUrl("https://app.example.com/"), {
    prefix: "https://app.example.com/",
    suffix: "",
  });
  assert.deepEqual(
    splitLockedPlaygroundUrl("https://app.example.com/foo/bar"),
    {
      prefix: "https://app.example.com/foo/",
      suffix: "bar",
    },
  );
  assert.deepEqual(
    splitLockedPlaygroundUrl("https://app.example.com/foo/bar?q=1"),
    {
      prefix: "https://app.example.com/foo/",
      suffix: "bar?q=1",
    },
  );
});

test("suffix navigates to prefix+suffix and rejects http or debug ports", () => {
  const next = playgroundAddressNavigation(
    "https://app.example.com/foo/bar",
    "baz",
  );
  assert.equal(next.ok, true);
  if (next.ok) {
    assert.equal(next.url, "https://app.example.com/foo/baz");
  }
  assert.equal(
    playgroundAddressNavigation("https://app.example.com/foo/bar", "").ok,
    true,
  );
  assert.equal(
    joinPlaygroundUrl("https://app.example.com/foo/", "baz"),
    "https://app.example.com/foo/baz",
  );
  assert.equal(
    playgroundAddressNavigation("https://app.example.com/foo/bar", "//evil").ok,
    true,
  );
  assert.equal(
    suffixFromCurrentUrl(
      "https://app.example.com/foo/bar",
      "https://app.example.com/foo/baz",
    ),
    "baz",
  );
});
