import assert from "node:assert/strict";
import test from "node:test";

import { popoutErrorMessage, popoutLabel } from "./popoutWindow.ts";

test("split labels stay unique when sid+channel prefixes collide at 48 chars", () => {
  const sid = `pg-${"s".repeat(40)}`;
  const channelId = `chan-${"c".repeat(40)}`;
  const prefix = `${sid}-${channelId}-`;
  assert.ok(prefix.length > 48);

  const seedA = `${sid}-${channelId}-thread-aaa`;
  const seedB = `${sid}-${channelId}-thread-bbb`;
  const labelA = popoutLabel("split", seedA);
  const labelB = popoutLabel("split", seedB);

  assert.notEqual(labelA, labelB);
  assert.equal(popoutLabel("split", seedA), labelA);
  assert.match(labelA, /^popout-split-[0-9a-f]{12,16}$/);
  assert.match(labelB, /^popout-split-[0-9a-f]{12,16}$/);
  assert.ok(labelA.length < 48);
  assert.ok(labelB.length < 48);
});

test("same playground+thread split keeps the same label", () => {
  const seed = "sid-channel-thread-1";
  assert.equal(popoutLabel("split", seed), popoutLabel("split", seed));
});

test("popoutErrorMessage prefers Error and string throws over the fallback", () => {
  assert.equal(
    popoutErrorMessage(
      new Error("label already exists"),
      "Could not open split.",
    ),
    "label already exists",
  );
  assert.equal(
    popoutErrorMessage("label already exists", "Could not open split."),
    "label already exists",
  );
  assert.equal(
    popoutErrorMessage({ reason: "nope" }, "Could not open split."),
    "Could not open split.",
  );
});
