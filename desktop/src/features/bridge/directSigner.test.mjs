import assert from "node:assert/strict";
import test from "node:test";
import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { createDirectSigner } from "./directSigner.ts";
import { devicePubkeyOf, pairDigest, signDigest, signWithDevice } from "./directSignerProto.ts";

function setup({ allow = true } = {}) {
  let devices = [];
  const log = [];
  const prompts = [];
  const signed = [];
  const s = createDirectSigner({
    store: { devices: () => devices, saveDevices: (d) => (devices = d), log: (e) => log.push(e) },
    confirm: async (t) => (prompts.push(t), allow),
    sign: async (ev) => (signed.push(ev), { ...ev, id: "x", sig: "y", pubkey: "acct" }),
    randomHex: () => "ab".repeat(16),
    now: () => 1000,
  });
  const secret = bytesToHex(schnorr.utils.randomSecretKey());
  const device = devicePubkeyOf(secret);
  return { s, secret, device, log, prompts, signed, revoke: () => (devices = devices.map((d) => ({ ...d, revokedAt: 1 }))) };
}
const ev = (kind) => ({ kind, created_at: 1700000000, tags: [["h", "c"]], content: "hi" });

test("pair once, then allow-listed kinds sign without prompting", async () => {
  const t = setup();
  const { nonce } = await t.s.handle("signer.hello", { _conn: "c1", device: t.device });
  await t.s.handle("signer.pair", { _conn: "c1", device: t.device, label: "Safari", sig: signWithDevice(pairDigest(nonce, t.device), t.secret) });
  assert.equal(t.prompts.length, 1);
  const r = await t.s.handle("signer.sign", { _conn: "c1", device: t.device, seq: 1, event: ev(9), sig: signWithDevice(signDigest(nonce, 1, ev(9)), t.secret) });
  assert.equal(r.event.pubkey, "acct");
  assert.equal(t.prompts.length, 1);
});

test("replay, wrong session, bad sig, unpaired and revoked are refused; other kinds prompt", async () => {
  const t = setup();
  const { nonce } = await t.s.handle("signer.hello", { _conn: "c1", device: t.device });
  const sign = (seq, e, n = nonce) => signWithDevice(signDigest(n, seq, e), t.secret);
  await assert.rejects(t.s.handle("signer.sign", { _conn: "c1", device: t.device, seq: 1, event: ev(9), sig: sign(1, ev(9)) }), /approved/);
  await t.s.handle("signer.pair", { _conn: "c1", device: t.device, sig: signWithDevice(pairDigest(nonce, t.device), t.secret) });
  await t.s.handle("signer.sign", { _conn: "c1", device: t.device, seq: 1, event: ev(9), sig: sign(1, ev(9)) });
  await assert.rejects(t.s.handle("signer.sign", { _conn: "c1", device: t.device, seq: 1, event: ev(9), sig: sign(1, ev(9)) }), /seq/);
  await assert.rejects(t.s.handle("signer.sign", { _conn: "c2", device: t.device, seq: 2, event: ev(9), sig: sign(2, ev(9)) }), /hello/);
  await assert.rejects(t.s.handle("signer.sign", { _conn: "c1", device: t.device, seq: 3, event: ev(9), sig: sign(3, ev(7)) }), /verify/);
  await t.s.handle("signer.sign", { _conn: "c1", device: t.device, seq: 4, event: ev(5), sig: sign(4, ev(5)) });
  assert.equal(t.prompts.length, 2, "kind 5 needed a desktop prompt");
  t.revoke();
  await assert.rejects(t.s.handle("signer.sign", { _conn: "c1", device: t.device, seq: 5, event: ev(9), sig: sign(5, ev(9)) }), /revoked/);
});

test("declined prompt signs nothing", async () => {
  const t = setup({ allow: false });
  const { nonce } = await t.s.handle("signer.hello", { _conn: "c1", device: t.device });
  await assert.rejects(t.s.handle("signer.pair", { _conn: "c1", device: t.device, sig: signWithDevice(pairDigest(nonce, t.device), t.secret) }), /Declined/);
  assert.equal(t.signed.length, 0);
});

import { unpairDigest } from "./directSignerProto.ts";
test("browser Forget (signer.unpair) revokes on the desktop; revoked browsers get an explicit 'revoked' error", async () => {
  const t = setup();
  const { nonce } = await t.s.handle("signer.hello", { _conn: "c1", device: t.device });
  await t.s.handle("signer.pair", { _conn: "c1", device: t.device, sig: signWithDevice(pairDigest(nonce, t.device), t.secret) });
  await assert.rejects(t.s.handle("signer.unpair", { _conn: "c1", device: t.device, sig: "0".repeat(128) }), /verify/);
  await t.s.handle("signer.unpair", { _conn: "c1", device: t.device, sig: signWithDevice(unpairDigest(nonce, t.device), t.secret) });
  assert.ok(t.log.some((e) => /forgotten by the browser/.test(e.note ?? "")));
  const h = await t.s.handle("signer.hello", { _conn: "c2", device: t.device });
  assert.equal(h.approved, false);
  assert.equal(h.revoked, true);
  await assert.rejects(
    t.s.handle("signer.sign", { _conn: "c2", device: t.device, seq: 1, event: ev(9), sig: signWithDevice(signDigest(h.nonce, 1, ev(9)), t.secret) }),
    (e) => e.code === "revoked",
  );
});
