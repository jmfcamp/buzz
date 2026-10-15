// End-to-end: web client (desktopBunker.ts + directRoute composite) ⇄ mock signer relay ⇄ the REAL desktop bunker
// (features/bridge/desktopBunker.ts), with the mock Clave signer on the same relay as the fallback.
import assert from "node:assert/strict";
import test from "node:test";
import { bytesToHex } from "@noble/hashes/utils.js";
import { generateSecretKey, verifyEvent } from "nostr-tools";
import { loadWs, startMockDesktopBunker, startMockSigner } from "../../../../scripts/pwa/mock-nip46-signer.mjs";

// Minimal in-memory IndexedDB (enough for nip46Store's kv object store).
function installMemoryIdb() {
  const data = new Map();
  const req = (fn) => {
    const r = { result: undefined };
    queueMicrotask(() => (r.result = fn()));
    return r;
  };
  globalThis.indexedDB = {
    open() {
      const r = {};
      queueMicrotask(() => {
        r.result = {
          close() {},
          createObjectStore() {},
          transaction() {
            const t = {};
            const store = {
              put: (v, k) => req(() => (data.set(k, structuredClone(v)), k)),
              get: (k) => req(() => (data.has(k) ? structuredClone(data.get(k)) : undefined)),
              delete: (k) => req(() => void data.delete(k)),
            };
            t.objectStore = () => store;
            setTimeout(() => t.oncomplete?.(), 0);
            return t;
          },
        };
        r.onsuccess?.();
      });
      return r;
    },
  };
}

test("desktop bunker: pair, sign, failover when asleep, switch back, revoke, forget", { timeout: 60_000 }, async () => {
  installMemoryIdb();
  // Node's built-in WebSocket dispatches Node Events, which jsdom's EventTarget rejects: use `ws` like a browser would.
  globalThis.WebSocket = (await loadWs()).WebSocket;
  const userSkHex = bytesToHex(generateSecretKey());
  const clave = await startMockSigner({ userSkHex, secret: "" });
  const desk = await startMockDesktopBunker({ relayUrl: clave.url, userSkHex });
  const web = await import("./desktopBunker.ts");
  const route = await import("./directRoute.ts");
  try {
    // 1. pair with a one-time code; the desktop prompts once
    const code = desk.code();
    assert.ok(web.isDesktopBunkerUri(code));
    const pk = await web.pairDesktopBunker(code);
    assert.equal(pk, desk.userPk);
    assert.equal(desk.prompts.length, 1);
    assert.equal(desk.devices()[0].via, "bunker");
    assert.equal(web.desktopBunkerStatus(), "online");
    const ds = route.getDirectSigner();
    assert.ok(ds && ds.active() && route.desktopSignerActive());

    // the same code can't pair a second browser
    const c2 = await import("./nip46.ts");
    const other = new c2.Nip46Client(bytesToHex(generateSecretKey()), new URL(code).hostname, [clave.url]);
    other.quiet = true;
    other.start();
    await assert.rejects(other.request("connect", ["x", new URL(code).searchParams.get("secret")], 5000), /expired|invalid/);
    other.stop();

    // 2. sign a message (auto) and encrypt to self through the desktop
    const signed = await ds.sign({ kind: 9, content: "hello", tags: [["h", "x"]], created_at: Math.floor(Date.now() / 1000) });
    assert.equal(signed.pubkey, desk.userPk);
    assert.ok(verifyEvent(signed));
    const ct = await ds.crypt("nip44_encrypt", desk.userPk, "secret settings");
    assert.equal(await ds.crypt("nip44_decrypt", desk.userPk, ct), "secret settings");
    assert.equal(clave.log.requests.length, 0, "Clave not used while the desktop answers");

    // 2b. relay drops every socket (iOS background / network change): both sides reconnect and signing still works
    clave.dropAllSockets();
    await new Promise((r) => setTimeout(r, 2500));
    const again = await ds.sign({ kind: 9, content: "after drop", tags: [], created_at: Math.floor(Date.now() / 1000) });
    assert.ok(verifyEvent(again));

    // 3. desktop asleep: TWO missed checks keep the desktop route (no flapping); the second marks it offline and
    //    signing fails FAST (instant Clave fallback)
    desk.sleep();
    assert.equal(await web.check(700), false);
    assert.equal(web.desktopBunkerStatus(), "online");
    assert.equal(await web.check(700), false);
    assert.notEqual(web.desktopBunkerStatus(), "offline", "two misses still aren't offline (3 needed)");
    assert.equal(await web.check(700), false);
    assert.equal(web.desktopBunkerStatus(), "offline");
    assert.equal(route.desktopSignerActive(), false);
    const t0 = Date.now();
    await assert.rejects(ds.sign({ kind: 9, content: "x", tags: [], created_at: 1 }), /desktop offline/);
    assert.ok(Date.now() - t0 < 500);
    // the fallback signer (mock Clave) still signs
    const claveClient = new c2.Nip46Client(bytesToHex(generateSecretKey()), clave.signerPk, [clave.url]);
    claveClient.quiet = true;
    claveClient.start();
    assert.equal(await claveClient.request("connect", [clave.signerPk, ""], 5000), "ack");
    const viaClave = JSON.parse(await claveClient.request("sign_event", [JSON.stringify({ kind: 9, content: "fallback", tags: [], created_at: 1 })], 5000));
    assert.equal(viaClave.pubkey, desk.userPk);
    claveClient.stop();

    // 4. desktop back: the next check switches back
    desk.wake();
    let back = false;
    for (let i = 0; i < 10 && !back; i++) back = await web.check(2000);
    assert.ok(back);
    assert.equal(route.desktopSignerActive(), true);

    // 5. revoked on the desktop: the browser drops the session
    desk.revokeAll();
    await assert.rejects(ds.sign({ kind: 9, content: "x", tags: [], created_at: 1 }));
    assert.equal(web.desktopBunkerStatus(), "revoked");
    assert.equal(web.hasDesktopBunker(), false);
    assert.equal(route.getDirectSigner(), null);

    // 6. pair again, then Forget here revokes it on the desktop too
    await web.pairDesktopBunker(desk.code());
    const dev = desk.devices().find((d) => !d.revokedAt);
    assert.ok(dev);
    await web.forgetDesktopBunker();
    assert.ok(desk.devices().find((d) => d.pubkey === dev.pubkey).revokedAt);
    assert.equal(web.hasDesktopBunker(), false);
  } finally {
    desk.stop();
    await clave.close();
  }
});
