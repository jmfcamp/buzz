import assert from "node:assert/strict";
import test from "node:test";

import { PLAYGROUND_DEVICES, playgroundDeviceViewport } from "./devices.ts";
import { DESKTOP_STAGE_PRESETS } from "./types.ts";

test("device museum is the locked six-device set", () => {
  assert.deepEqual(
    PLAYGROUND_DEVICES.map((device) => [
      device.id,
      device.width,
      device.height,
    ]),
    [
      ["iphone-se", 375, 667],
      ["iphone-16", 393, 852],
      ["iphone-16-pro-max", 440, 956],
      ["pixel-8", 412, 915],
      ["ipad-mini", 744, 1133],
      ["ipad-pro-11", 834, 1210],
    ],
  );
  assert.deepEqual(
    playgroundDeviceViewport(PLAYGROUND_DEVICES[1], "landscape"),
    { width: 852, height: 393 },
  );
});

test("desktop stage presets are locked", () => {
  assert.deepEqual(
    [...DESKTOP_STAGE_PRESETS],
    [375, 390, 768, 1024, 1280, 1440],
  );
});
