import assert from "node:assert/strict";
import test from "node:test";

import {
  hulaRootedDisplayPath,
  shortenProjectPath,
} from "./projectPathDisplay.ts";

test("keeps short repository paths intact", () => {
  assert.equal(shortenProjectPath("repos/buzz"), "repos/buzz");
});

test("shortens long repository paths to their trailing segments", () => {
  assert.equal(
    shortenProjectPath("/Users/sample-user/sprout/projects/buzz"),
    "…/sprout/projects/buzz",
  );
});

test("normalizes Windows separators for display", () => {
  assert.equal(
    shortenProjectPath("C:\\Users\\sample-user\\repos\\buzz"),
    "…/sample-user/repos/buzz",
  );
});

test("hula-rooted display strips everything before Hula", () => {
  assert.equal(
    hulaRootedDisplayPath("/Users/jm/Documents/Hula/products/research"),
    "Hula/products/research",
  );
  assert.equal(
    hulaRootedDisplayPath("Hula/products/research"),
    "Hula/products/research",
  );
  assert.equal(
    hulaRootedDisplayPath(
      "/home/ubuntu/.openclaw/workspace/Hula/projects/claimminer",
    ),
    "Hula/projects/claimminer",
  );
});

test("hula-rooted display falls back to shorten when Hula is absent", () => {
  assert.equal(
    hulaRootedDisplayPath("/Users/sample-user/sprout/projects/buzz"),
    "…/sprout/projects/buzz",
  );
});
