import { test } from "node:test";
import assert from "node:assert/strict";

class FakeWS {
  static OPEN = 1; static CONNECTING = 0; static CLOSED = 3;
  static last = null;
  constructor(url) { this.url = url; this.readyState = 0; this.sent = []; FakeWS.last = this; setTimeout(() => { this.readyState = 1; this.onopen?.(); }, 0); }
  send(d) { this.sent.push(d); }
  close() { this.readyState = 3; }
  recv(frame) { this.onmessage?.({ data: JSON.stringify(frame) }); }
}
globalThis.WebSocket = FakeWS;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const { wsConnect, wsSend, wsClose, PACE_BURST, PACE_PER_SEC } = await import("./websocket.ts");

test("REQ burst after reconnect is paced, deduped, and honours rate-limit hints", async () => {
  const id = await wsConnect("wss://relay.test", { onmessage() {} });
  const ws = FakeWS.last;
  const send = (f) => wsSend(id, { type: "Text", data: JSON.stringify(f) });
  for (let i = 0; i < 30; i++) send(["REQ", `s${i}`, { kinds: [1] }]);
  assert.equal(ws.sent.length, PACE_BURST, "only the burst goes out immediately");
  send(["REQ", "s20", { kinds: [2] }]); // re-request while queued: replaces, no extra frame
  send(["CLOSE", "s21"]); // close a queued sub: neither REQ nor CLOSE goes out
  await sleep(1000);
  const reqs = ws.sent.filter((s) => s.startsWith('["REQ"'));
  assert.ok(reqs.length <= PACE_BURST + PACE_PER_SEC + 1, `≤ bucket rate in 1s, got ${reqs.length}`);
  ws.recv(["CLOSED", "s5", "rate-limited: quota exceeded; retry in 2s"]);
  const before = ws.sent.length;
  await sleep(1500);
  assert.equal(ws.sent.length, before, "paused during retry hint");
  await sleep(4000);
  const all = ws.sent.filter((s) => s.startsWith('["REQ"')).map((s) => JSON.parse(s));
  assert.equal(all.length, 29, "30 subs - 1 cancelled, dedupe kept one per sub");
  assert.deepEqual(all.find((f) => f[1] === "s20")[2], { kinds: [2] }, "latest filter wins");
  assert.ok(!all.some((f) => f[1] === "s21"));
  assert.ok(!ws.sent.some((s) => s.includes('"CLOSE","s21"')));
  wsSend(id, { type: "Text", data: '["AUTH",{"id":"x"}]' });
  assert.ok(ws.sent.at(-1).startsWith('["AUTH"'), "AUTH bypasses the queue");
  wsClose(id);
});
