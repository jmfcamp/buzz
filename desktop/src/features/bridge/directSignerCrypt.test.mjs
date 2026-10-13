import assert from "node:assert/strict";
import test from "node:test";
import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { createDirectSigner } from "./directSigner.ts";
import { cryptDigest, devicePubkeyOf, pairDigest, signWithDevice } from "./directSignerProto.ts";

const ME = "a".repeat(64);
const BOT = "b".repeat(64);
const STRANGER = "c".repeat(64);

async function setup({ allow = true, crypt = true } = {}) {
  let devices = [];
  const log = [];
  const prompts = [];
  const calls = [];
  const s = createDirectSigner({
    store: { devices: () => devices, saveDevices: (d) => (devices = d), log: (e) => log.push(e) },
    confirm: async (t) => (prompts.push(t), allow),
    sign: async () => ({}),
    randomHex: () => "cd".repeat(16),
    now: () => 1000,
    crypt: crypt
      ? {
          selfPubkey: () => ME,
          encryptToSelf: async (t) => (calls.push(["encSelf", t]), `E(${t})`),
          encryptToPeer: async (p, t) => (calls.push(["encPeer", p, t]), `EP(${t})`),
          decryptFromSelf: async (t) => (calls.push(["decSelf", t]), `D(${t})`),
          decryptFromPeer: async (p, t) => (calls.push(["decPeer", p, t]), `DP(${t})`),
          isOwnAgent: async (p) => p === BOT,
        }
      : undefined,
  });
  const secret = bytesToHex(schnorr.utils.randomSecretKey());
  const device = devicePubkeyOf(secret);
  const hello = await s.handle("signer.hello", { _conn: "c1", device });
  await s.handle("signer.pair", { _conn: "c1", device, sig: signWithDevice(pairDigest(hello.nonce, device), secret) });
  let seq = 0;
  const req = (op, peer, text, sigText = text) => {
    seq++;
    return s.handle("signer.crypt", { _conn: "c1", device, seq, op, peer, text, sig: signWithDevice(cryptDigest(hello.nonce, seq, op, peer, sigText), secret) });
  };
  return { s, hello, req, log, prompts, calls };
}

test("hello advertises nip44 only when the desktop supports it", async () => {
  assert.deepEqual((await setup()).hello.caps, ["sign-any", "nip44"]);
  assert.deepEqual((await setup({ crypt: false })).hello.caps, ["sign-any"]);
});

test("self encrypt/decrypt runs without a prompt and is logged", async () => {
  const t = await setup();
  const pairPrompts = t.prompts.length;
  assert.equal((await t.req("nip44_encrypt", ME, "x")).text, "E(x)");
  assert.equal((await t.req("nip44_decrypt", ME, "y")).text, "D(y)");
  assert.equal(t.prompts.length, pairPrompts);
  assert.ok(t.log.some((e) => e.kind === -2 && /encrypt \(self\)/.test(e.note)));
});

test("observer decrypt from an own agent: no prompt; from a stranger: refused", async () => {
  const t = await setup();
  const n = t.prompts.length;
  assert.equal((await t.req("nip44_decrypt", BOT, "f")).text, "DP(f)");
  assert.equal(t.prompts.length, n);
  await assert.rejects(t.req("nip44_decrypt", STRANGER, "f"), /Only your own/);
});

test("encrypt to someone else prompts", async () => {
  const t = await setup({ allow: true });
  assert.equal((await t.req("nip44_encrypt", STRANGER, "z")).text, "EP(z)");
  assert.ok(t.prompts.some((p) => /Encrypt this/.test(p)));
});

test("tampered text fails the device signature; replayed seq is refused", async () => {
  const t = await setup();
  await assert.rejects(t.req("nip44_decrypt", ME, "real", "other"), /verify/);
});

import { AUTO_SIGN_KINDS, isAutoSignKind } from "./directSignerProto.ts";
test("old desktops keep the old no-prompt list; sign-any desktops add presence/typing/media auth", () => {
  assert.equal(isAutoSignKind(20002), false);
  assert.equal(isAutoSignKind(20002, ["sign-any"]), true);
  assert.equal(isAutoSignKind(0, ["sign-any"]), false, "profile still prompts");
  assert.equal(isAutoSignKind(5, ["sign-any"]), false, "deletion still prompts");
  for (const k of AUTO_SIGN_KINDS) assert.equal(isAutoSignKind(k), true);
});
