import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const src = fs.readFileSync(
  new URL("./HuddleBar.tsx", import.meta.url),
  "utf8",
);

test("HuddleBar expands share into a shell stage portal, not OS fullscreen", () => {
  assert.match(src, /createPortal/);
  assert.match(src, /buzz-huddle-share-stage/);
  assert.match(src, /data-huddle-share-expanded/);
  assert.match(src, /Expand shared screen/);
  assert.match(src, /Collapse shared screen/);
  assert.match(src, /shareExpanded/);
  assert.doesNotMatch(src, /requestFullscreen|webkitRequestFullscreen/);
});

test("HuddleBar removes dock-to-main / return-to-drawer affordance", () => {
  assert.doesNotMatch(src, /close_huddle_companion/);
  assert.doesNotMatch(src, /Return huddle to drawer/);
  assert.doesNotMatch(src, /handleReturnToDrawer/);
  // Open companion from main remains; room no longer docks back.
  assert.match(src, /Open huddle window/);
  assert.match(src, /mode === "main"/);
});
