import assert from "node:assert/strict";
import { test } from "node:test";
import { awaitPingOutcome } from "./pingOutcome.ts";

function harness() {
  let listener = null; let onTimeout = null; let t = 1000;
  return {
    subscribe: (l) => { listener = l; return () => { listener = null; }; },
    scheduleTimeout: (f) => { onTimeout = f; return () => { onTimeout = null; }; },
    now: () => t,
    emit: (f) => listener?.(f),
    fire: () => onTimeout?.(),
    advance: (ms) => { t += ms; },
    get listening() { return listener !== null; },
  };
}

test("resolves up with elapsed ms on matching pong", async () => {
  const h = harness();
  const p = awaitPingOutcome({ requestId: "r1", ...h, sendPing: async () => {} });
  h.advance(42);
  h.emit({ type: "ping", status: "pong", requestId: "other" });
  h.emit({ type: "cancel_turn", status: "sent", requestId: "r1" });
  h.emit({ type: "ping", status: "pong", requestId: "r1" });
  assert.deepEqual(await p, { kind: "up", ms: 42 });
  assert.equal(h.listening, false);
});

test("resolves timeout when no pong arrives", async () => {
  const h = harness();
  const p = awaitPingOutcome({ requestId: "r2", ...h, sendPing: async () => {} });
  h.fire();
  assert.deepEqual(await p, { kind: "timeout" });
  assert.equal(h.listening, false);
});

test("rejects when the send fails", async () => {
  const h = harness();
  const p = awaitPingOutcome({ requestId: "r3", ...h, sendPing: async () => { throw new Error("no signer"); } });
  await assert.rejects(p, /no signer/);
});
