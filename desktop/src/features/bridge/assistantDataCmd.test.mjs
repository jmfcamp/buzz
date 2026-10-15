import assert from "node:assert/strict";
import test from "node:test";

import { setAssistantDirectBackend } from "../assistantData/directBackend.ts";
import { handleCmd, redactDeep } from "./directCmd.ts";

const OWNER = "a".repeat(64);
const RELAY = "wss://relay.test";
const deps = { invokeRaw: async () => null, ownerPubkey: OWNER };

test("assistant_data_get/act go to the desktop backend for its own relay+owner, secrets redacted", async () => {
  const calls = [];
  setAssistantDirectBackend({
    relayUrl: RELAY,
    ownerPubkey: OWNER,
    get: (kind) => ({ kind, notes: [{ id: "n", body: "token: sk-abcdefghijklmnopqrstuv" }] }),
    act: (kind, action, payload) => void calls.push([kind, action, payload]),
  });
  const r = await handleCmd("assistant_data_get", { kind: "scratch", expectedRelayUrl: RELAY + "/", expectedSignerPubkey: OWNER }, deps);
  assert.equal(r.kind, "scratch");
  assert.ok(!JSON.stringify(r).includes("sk-abcdefghij"));
  await handleCmd("assistant_data_act", { kind: "jobs", action: "remove", payload: { id: "j1" }, expectedRelayUrl: RELAY, expectedSignerPubkey: OWNER }, deps);
  assert.deepEqual(calls, [["jobs", "remove", { id: "j1" }]]);
  await assert.rejects(handleCmd("assistant_data_get", { kind: "jobs", expectedRelayUrl: "wss://other", expectedSignerPubkey: OWNER }, deps));
  await assert.rejects(handleCmd("assistant_data_get", { kind: "nope", expectedRelayUrl: RELAY, expectedSignerPubkey: OWNER }, deps));
  setAssistantDirectBackend(null);
  await assert.rejects(handleCmd("assistant_data_get", { kind: "jobs", expectedRelayUrl: RELAY, expectedSignerPubkey: OWNER }, deps));
});

test("redactDeep keeps shape and drops non-JSON values", () => {
  assert.deepEqual(redactDeep({ a: [1, "x", null, true], f: () => 1 }), { a: [1, "x", null, true], f: null });
});
