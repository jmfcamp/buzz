// Two throwaway clients: B subscribes to kind 24133 #p=B; A publishes one -> B must receive it. Kind 1 must be rejected.
import { schnorr } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import WebSocket from "ws";
const url = process.argv[2];
const key = () => { const sk = schnorr.utils.randomSecretKey(); return { sk, pk: bytesToHex(schnorr.getPublicKey(sk)) }; };
const mk = (k, kind, tags, content) => {
  const created_at = Math.floor(Date.now() / 1000);
  const id = bytesToHex(sha256(utf8ToBytes(JSON.stringify([0, k.pk, created_at, kind, tags, content]))));
  return { id, pubkey: k.pk, created_at, kind, tags, content, sig: bytesToHex(schnorr.sign(hexToBytes(id), k.sk)) };
};
const open = (u) => new Promise((res, rej) => { const w = new WebSocket(u); w.on("open", () => res(w)); w.on("error", rej); });
const next = (w, pred, ms = 5000) => new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error("timeout")), ms);
  const h = (d) => { const m = JSON.parse(d.toString()); if (pred(m)) { clearTimeout(t); w.off("message", h); res(m); } };
  w.on("message", h);
});
const A = key(), B = key();
const wa = await open(url), wb = await open(url);
wb.send(JSON.stringify(["REQ", "s1", { kinds: [24133], "#p": [B.pk], since: Math.floor(Date.now() / 1000) - 5 }]));
await next(wb, (m) => m[0] === "EOSE" && m[1] === "s1");
const ev = mk(A, 24133, [["p", B.pk]], "ciphertext-placeholder");
const got = next(wb, (m) => m[0] === "EVENT" && m[1] === "s1");
wa.send(JSON.stringify(["EVENT", ev]));
const ok = await next(wa, (m) => m[0] === "OK" && m[1] === ev.id);
const rcv = await got;
console.log("24133 OK:", ok[2], "| delivered to B:", rcv[2].id === ev.id);
const bad = mk(A, 1, [], "hello");
wa.send(JSON.stringify(["EVENT", bad]));
const r = await next(wa, (m) => m[0] === "OK" && m[1] === bad.id);
console.log("kind 1 accepted:", r[2], "|", r[3]);
const forged = { ...mk(A, 24133, [["p", B.pk]], "x"), content: "tampered" };
wa.send(JSON.stringify(["EVENT", forged]));
const f = await next(wa, (m) => m[0] === "OK" && m[1] === forged.id);
console.log("forged accepted:", f[2], "|", f[3]);
// Replay: C subscribes AFTER an event for it was published (its socket was "down") and must still get it.
const C = key();
const late = mk(A, 24133, [["p", C.pk]], "missed-while-away");
wa.send(JSON.stringify(["EVENT", late]));
await next(wa, (m) => m[0] === "OK" && m[1] === late.id);
const wc = await open(url);
const replayed = next(wc, (m) => m[0] === "EVENT" && m[1] === "s2" && m[2].id === late.id);
wc.send(JSON.stringify(["REQ", "s2", { kinds: [24133], "#p": [C.pk], since: Math.floor(Date.now() / 1000) - 30 }]));
const rp = await replayed.then(() => true, () => false);
console.log("replayed to late subscriber:", rp);
wa.close(); wb.close(); wc.close();
process.exit(ok[2] && rcv[2].id === ev.id && !r[2] && !f[2] && rp ? 0 : 1);
