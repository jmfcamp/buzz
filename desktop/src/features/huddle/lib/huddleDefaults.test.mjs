import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  exactMicrophoneDeviceId,
  mediaDeviceOptions,
  normalizeHuddleDefaults,
} from "./huddleDefaults.ts";

test("missing push to talk stays on and an explicit false stays off", () => {
  assert.equal(normalizeHuddleDefaults({}).pushToTalk, true);
  assert.equal(
    normalizeHuddleDefaults({ pushToTalk: false }).pushToTalk,
    false,
  );
});

test("microphone gain is clamped and a bad value becomes full volume", () => {
  assert.equal(
    normalizeHuddleDefaults({ microphoneGain: 4 }).microphoneGain,
    1,
  );
  assert.equal(
    normalizeHuddleDefaults({ microphoneGain: Number.NaN }).microphoneGain,
    1,
  );
  assert.equal(
    normalizeHuddleDefaults({ microphoneGain: 0.25 }).microphoneGain,
    0.25,
  );
});

test("an unplugged saved device stays selectable", () => {
  const options = mediaDeviceOptions(
    [{ deviceId: "mic-1", label: "Desk mic", kind: "audioinput" }],
    "audioinput",
    "mic-gone",
    "Microphone",
  );
  assert.deepEqual(
    options.map((option) => option.label),
    ["System default", "Desk mic", "Saved device (unplugged)"],
  );
});

test("exact microphone id is kept until enumeration proves it is gone", () => {
  assert.equal(exactMicrophoneDeviceId("", ["mic-1"]), null);
  assert.equal(exactMicrophoneDeviceId("mic-1", []), "mic-1");
  assert.equal(exactMicrophoneDeviceId("mic-1", ["mic-1"]), "mic-1");
  assert.equal(exactMicrophoneDeviceId("mic-gone", ["mic-1"]), null);
});

test("huddle startup uses the saved device guard and persists microphone edits", () => {
  const source = readFileSync(
    new URL("../HuddleContext.tsx", import.meta.url),
    "utf8",
  );
  const controls = readFileSync(
    new URL("./useHuddleDeviceControls.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /exactMicrophoneDeviceId\(/);
  assert.match(source, /useHuddleDeviceControls\(/);
  assert.match(
    controls,
    /saveHuddleDefaults\(\{ microphoneDeviceId: deviceId \}\)/,
  );
  assert.match(controls, /saveMicrophoneGain\(clamped\)/);
  const commandListener = source.slice(
    source.indexOf('event.payload.type === "set-input-device"'),
    source.indexOf('event.payload.type === "set-voice-input-mode"'),
  );
  assert.doesNotMatch(commandListener, /saveHuddleDefaults|saveMicrophoneGain/);
});
