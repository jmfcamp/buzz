import assert from "node:assert/strict";
import { test } from "node:test";

import { buildPushPrefsPayload } from "./pushPrefsPayload.ts";

const on = { dm: true, mention: true, thread_reply: true, needs_action: true };

test("push prefs: reminder / assistant_reply off and the assistant key ride along", () => {
  const p = buildPushPrefsPayload({ ...on, dm: false }, [], [], {
    events: { reminder: false, assistant_reply: false },
    assistantPubkey: "C".repeat(64),
  });
  assert.deepEqual(p.off, ["dm", "reminder", "assistant_reply"]);
  assert.deepEqual(p.assistant_pubkeys, ["c".repeat(64)]);
});

test("push prefs: defaults stay the old shape (no new keys when on / unknown assistant)", () => {
  const p = buildPushPrefsPayload(on, [], []);
  assert.deepEqual(p, { v: 1, off: [], muted_channels: [], muted_threads: [] });
  assert.equal(
    buildPushPrefsPayload(on, [], [], { assistantPubkey: "nope" })
      .assistant_pubkeys,
    undefined,
  );
});
