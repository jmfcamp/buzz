import assert from "node:assert/strict";
import test from "node:test";
import { createEnvelope, ENVELOPE_PREFIX, KEY_POINTER_D } from "./appDataEnvelope.ts";

function world() {
  const store = new Map(); // d -> content (one shared relay)
  let selfCalls = 0;
  const legacyEnc = async (p) => (selfCalls++, `self:${Buffer.from(p).toString("base64")}`);
  const legacyDec = async (c) => {
    selfCalls++;
    if (!c.startsWith("self:")) throw new Error("not self");
    return Buffer.from(c.slice(5), "base64").toString();
  };
  const client = (enabled) =>
    createEnvelope({
      pubkey: async () => "pk",
      encryptToSelf: legacyEnc,
      decryptFromSelf: legacyDec,
      fetchOwn: async (_pk, d) => store.get(d) ?? null,
      publishOwn: async (d, c) => void store.set(d, c),
      randomBytes: (n) => crypto.getRandomValues(new Uint8Array(n)),
      enabled: () => enabled.on,
    });
  return { store, client, calls: () => selfCalls };
}

test("flag off writes legacy NIP-44 readable by old clients", async () => {
  const w = world();
  const c = w.client({ on: false });
  const ct = await c.encrypt("hello");
  assert.ok(!ct.startsWith(ENVELOPE_PREFIX));
  assert.equal(await c.decrypt(ct), "hello");
});

test("envelope: key wrapped once, then local crypto; other device reads it; legacy still reads", async () => {
  const w = world();
  const a = w.client({ on: true });
  const legacy = await w.client({ on: false }).encrypt("old");
  const e1 = await a.encrypt("one");
  const before = w.calls();
  const e2 = await a.encrypt("two");
  assert.equal(w.calls(), before, "no signer call for subsequent writes");
  assert.ok(e1.startsWith(ENVELOPE_PREFIX) && w.store.has(KEY_POINTER_D));
  const b = w.client({ on: false }); // new device, flag off, still reads envelopes
  assert.equal(await b.decrypt(e1), "one");
  const n = w.calls();
  assert.equal(await b.decrypt(e2), "two");
  assert.equal(w.calls(), n, "key unwrapped once per device");
  assert.equal(await a.decrypt(legacy), "old");
});

test("concurrent key creation on two devices keeps both readable", async () => {
  const w = world();
  const a = w.client({ on: true });
  const b = w.client({ on: true });
  const [ea, eb] = await Promise.all([a.encrypt("A"), b.encrypt("B")]);
  const c = w.client({ on: true });
  assert.equal(await c.decrypt(ea), "A");
  assert.equal(await c.decrypt(eb), "B");
});
