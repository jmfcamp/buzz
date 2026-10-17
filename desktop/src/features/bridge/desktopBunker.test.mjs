import assert from "node:assert/strict";
import test from "node:test";
import { createBunkerPolicy, BunkerError } from "./desktopBunker.ts";
import { buildBunkerUri, isDesktopBunkerUri, bunkerAutoKind } from "./bunkerProto.ts";

const A = "a".repeat(64);
const B = "b".repeat(64);
function setup({ allow = true, t0 = 1_000_000 } = {}) {
  let devices = [];
  const log = [];
  const prompts = [];
  let t = t0;
  const p = createBunkerPolicy({
    store: { devices: () => devices, saveDevices: (d) => (devices = d), log: (e) => log.push(e) },
    confirm: async (title) => (prompts.push(title), typeof allow === "function" ? allow(title) : allow),
    sign: async (ev) => ({ ...ev, id: "i", sig: "s", pubkey: "acct" }),
    randomHex: (n) => "c".repeat(n * 2),
    now: () => t,
    userPubkey: () => "acct",
    crypt: {
      selfPubkey: () => "f".repeat(64),
      encryptToSelf: async (x) => `self:${x}`,
      encryptToPeer: async (peer, x) => `peer:${x}`,
      decryptFromSelf: async (x) => `dself:${x}`,
      decryptFromPeer: async (peer, x) => `dpeer:${x}`,
    },
  });
  return { p, log, prompts, devices: () => devices, tick: (ms) => (t += ms) };
}
const ev = (kind) => JSON.stringify({ kind, content: "hi", tags: [], created_at: 1 });

test("connect needs the active one-time code, then an Allow on the desktop", async () => {
  const s = setup();
  await assert.rejects(s.p.handle(A, "connect", ["x", "nope"]), BunkerError);
  const c = s.p.newCode();
  assert.equal(await s.p.handle(A, "connect", ["x", c.secret, "", "iPhone (Hula Buzz app)"]), "ack");
  assert.equal(s.prompts.length, 1);
  assert.equal(s.devices()[0].via, "bunker");
  assert.equal(s.devices()[0].label, "iPhone (Hula Buzz app)");
  // one browser per code
  await assert.rejects(s.p.handle(B, "connect", ["x", c.secret]), /expired|invalid/);
  assert.equal(await s.p.handle(A, "get_public_key", []), "acct");
});

test("expired codes are refused; declined pairing stores nothing and burns the code", async () => {
  const s = setup({ allow: false });
  const c = s.p.newCode();
  s.tick(5 * 60_000 + 1);
  await assert.rejects(s.p.handle(A, "connect", ["x", c.secret]), /expired|invalid/);
  const c2 = s.p.newCode();
  await assert.rejects(s.p.handle(A, "connect", ["x", c2.secret]), /declined/);
  assert.equal(s.devices().length, 0);
  assert.equal(s.p.activeCode(), null);
});

test("strangers get silence; revoked devices get 'revoked'", async () => {
  const s = setup();
  assert.equal(await s.p.handle(A, "sign_event", [ev(9)]), null);
  const c = s.p.newCode();
  await s.p.handle(A, "connect", ["x", c.secret]);
  assert.equal(await s.p.handle(A, BUNKER_UNPAIR(), []), "ok");
  await assert.rejects(s.p.handle(A, "sign_event", [ev(9)]), /revoked/);
});
const BUNKER_UNPAIR = () => "buzz_unpair";

test("full access: a paired browser signs every kind silently", async () => {
  const s = setup({ allow: (t) => !/Sign this/.test(t) || false });
  const c = s.p.newCode();
  await s.p.handle(A, "connect", ["x", c.secret]);
  s.prompts.length = 0;
  for (const k of [9, 7, 22242, 27235, 30078, 20002, 0, 3, 5]) assert.equal(JSON.parse(await s.p.handle(A, "sign_event", [ev(k)])).kind, k);
  assert.equal(s.prompts.length, 0);
  for (const k of [0, 3, 5, 9, 30350]) assert.equal(bunkerAutoKind(k), true);
});

test("nip44 self and peer, rate limit", async () => {
  const s = setup();
  const c = s.p.newCode();
  await s.p.handle(A, "connect", ["x", c.secret]);
  assert.equal(await s.p.handle(A, "nip44_encrypt", ["f".repeat(64), "x"]), "self:x");
  assert.equal(await s.p.handle(A, "nip44_decrypt", [B, "y"]), "dpeer:y");
  let limited = false;
  for (let i = 0; i < 80; i++)
    try {
      await s.p.handle(A, "ping", []);
    } catch (e) {
      limited ||= /rate limited/.test(String(e.message));
    }
  assert.ok(limited);
});

test("bunker code format", () => {
  const u = buildBunkerUri(A, "s3", ["wss://signer.huladesk.com"]);
  assert.ok(isDesktopBunkerUri(u));
  assert.ok(!isDesktopBunkerUri(`bunker://${A}?relay=wss://x&secret=1`));
  assert.ok(u.startsWith(`bunker://${A}?relay=wss%3A%2F%2Fsigner.huladesk.com`));
});
