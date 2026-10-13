import assert from "node:assert/strict";
import test from "node:test";
import { finalizeEvent, generateSecretKey, getPublicKey, nip44 } from "nostr-tools";
import { bytesToHex } from "nostr-tools/utils";

// ── minimal browser shims ──
const docListeners = {};
globalThis.document ??= {
  visibilityState: "visible",
  addEventListener: (t, f) => ((docListeners[t] ??= []).push(f)),
  removeEventListener: () => {},
};
globalThis.window ??= { addEventListener: () => {}, removeEventListener: () => {}, open: () => {} };
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {}, key: () => null, length: 0 };

const signerSk = generateSecretKey();
const signerPk = getPublicKey(signerSk);
const sockets = [];
class FakeWS {
  static OPEN = 1;
  static CLOSED = 3;
  readyState = 0;
  sent = [];
  closedByClient = false;
  mute = false; // frozen socket: swallows frames silently
  constructor(url) {
    this.url = url;
    sockets.push(this);
    setTimeout(() => {
      this.readyState = 1;
      this.onopen?.();
    }, 1);
  }
  send(raw) {
    this.sent.push(raw);
    if (this.mute) return;
    const msg = JSON.parse(raw);
    if (msg[0] === "REQ" && String(msg[1]).startsWith("ping")) setTimeout(() => this.onmessage?.({ data: JSON.stringify(["EOSE", msg[1]]) }), 1);
    if (msg[0] === "EVENT") signer.onRequest(this, msg[1]);
  }
  close() {
    this.closedByClient = true;
    this.readyState = 3;
    this.onclose?.();
  }
}
globalThis.WebSocket = FakeWS;

const signer = {
  delayMs: 5,
  handled: [],
  onRequest(ws, ev) {
    const ck = nip44.v2.utils.getConversationKey(signerSk, ev.pubkey);
    const body = JSON.parse(nip44.v2.decrypt(ev.content, ck));
    this.handled.push(body);
    setTimeout(() => {
      const reply = finalizeEvent(
        { kind: 24133, created_at: Math.floor(Date.now() / 1000), tags: [["p", ev.pubkey]], content: nip44.v2.encrypt(JSON.stringify({ id: body.id, result: `ok:${body.method}` }), ck) },
        signerSk,
      );
      if (ws.readyState === 1 && !ws.mute) ws.onmessage?.({ data: JSON.stringify(["EVENT", "nip46", reply]) });
    }, this.delayMs);
  },
};

const { Nip46Client, pruneSignerRelays, FALLBACK_SIGNER_RELAY } = await import("./nip46.ts");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test("prunes to answering relays plus one fallback", () => {
  const all = ["wss://relay.nsec.app", FALLBACK_SIGNER_RELAY, "wss://nrs.primal.net", "wss://relay.damus.io"];
  assert.deepEqual(pruneSignerRelays(all, ["wss://nrs.primal.net"]), ["wss://nrs.primal.net", FALLBACK_SIGNER_RELAY]);
  assert.deepEqual(pruneSignerRelays(all, []), all);
  assert.deepEqual(pruneSignerRelays([FALLBACK_SIGNER_RELAY, "wss://a"], [FALLBACK_SIGNER_RELAY]), [FALLBACK_SIGNER_RELAY, "wss://a"]);
});

test("aborted caller leaves; identical retry attaches and the late reply resolves it (signer asked once)", async () => {
  sockets.length = 0;
  signer.handled.length = 0;
  signer.delayMs = 80;
  const c = new Nip46Client(bytesToHex(generateSecretKey()), signerPk, ["wss://r1"]);
  c.start();
  await wait(5);
  const ctrl = new AbortController();
  const first = c.request("nip44_decrypt", ["peer", "ct"], 5000, ctrl.signal);
  await wait(10);
  ctrl.abort();
  await assert.rejects(first);
  const retry = await c.request("nip44_decrypt", ["peer", "ct"], 5000);
  assert.equal(retry, "ok:nip44_decrypt");
  assert.equal(signer.handled.length, 1);
  c.stop();
});

test("a slow answer does not tear down sockets (no 10s rebuild), and replies on the open socket arrive", async () => {
  sockets.length = 0;
  signer.delayMs = 40;
  const c = new Nip46Client(bytesToHex(generateSecretKey()), signerPk, ["wss://r1", "wss://r2"]);
  c.start();
  await wait(5);
  const r = c.request("sign_event", ["{}"], 5000);
  await wait(2);
  c.reconnectAll(true); // what a foreground/forced rebuild used to do
  assert.equal(await r, "ok:sign_event");
  assert.equal(sockets.filter((s) => s.closedByClient).length, 0);
  c.stop();
});

test("a frozen socket fails its probe and is replaced; pending requests reach the signer on the new one", async () => {
  sockets.length = 0;
  signer.handled.length = 0;
  signer.delayMs = 5;
  const c = new Nip46Client(bytesToHex(generateSecretKey()), signerPk, ["wss://r1"]);
  c.start();
  await wait(5);
  sockets[0].mute = true; // iOS froze it; still claims OPEN
  const r = c.request("sign_event", ['{"k":1}'], 10_000);
  const alive = await c["probe"](c["conns"][0], 30);
  assert.equal(alive, false);
  assert.equal(sockets.length, 2);
  assert.equal(await r, "ok:sign_event");
  c.stop();
});

test("answering relay is recorded for pruning", async () => {
  sockets.length = 0;
  const c = new Nip46Client(bytesToHex(generateSecretKey()), signerPk, ["wss://only"]);
  const seen = [];
  c.onRelayAnswered = (u) => seen.push(u);
  c.start();
  await wait(5);
  await c.request("get_public_key", [], 2000);
  assert.deepEqual(seen, ["wss://only"]);
  c.stop();
});
