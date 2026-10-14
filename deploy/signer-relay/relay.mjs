// Buzz signer relay: a tiny Nostr relay for NIP-46 (kind 24133) only.
// - Short replay buffer: events are fanned out live AND kept for REPLAY_MS (60s), so a client whose socket was down
//   (iOS background, Wi-Fi switch, desktop reconnect) gets the reply it missed when it re-subscribes with `since`.
//   Only filters with a "#p" tag are replayed (a client asks for messages addressed to its own key); nothing is persisted.
// - One JSON log line per connection close (duration, counts, rate-limit hits) and per rate-limit rejection (sampled).
// - No auth. Events must carry a valid id + schnorr sig (so per-pubkey limits can't be spoofed).
// - Rate limits per IP (connections, events, REQs) and per pubkey (events). Size limits on frames/subs/filters.
// - Keepalive: WebSocket ping every 30s; a connection that misses a pong is terminated.
import http from "node:http";
import { schnorr } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { WebSocketServer } from "ws";

const PORT = Number(process.env.PORT || 7777);
const KIND = 24133;
const MAX_FRAME = 128 * 1024;
const MAX_SUBS = 20;
const MAX_FILTERS = 10;
const MAX_CONNS_PER_IP = 40;
const REPLAY_MS = Number(process.env.REPLAY_MS || 60_000);
const REPLAY_MAX = 5_000; // events kept at most (oldest dropped first)
const replay = []; // [{ev, at}] oldest first
function remember(ev) {
  replay.push({ ev, at: Date.now() });
  pruneReplay();
}
function pruneReplay() {
  const cutoff = Date.now() - REPLAY_MS;
  let n = 0;
  while (n < replay.length && (replay[n].at < cutoff || replay.length - n > REPLAY_MAX)) n++;
  if (n) replay.splice(0, n);
}
setInterval(pruneReplay, 10_000).unref();
const log = (o) => console.log(JSON.stringify({ t: new Date().toISOString(), ...o }));
const ipTag = (ip) => bytesToHex(sha256(utf8ToBytes(`buzz-signer:${ip}`))).slice(0, 10); // no raw IPs in logs
const PING_MS = 30_000;
const LIMITS = {
  ipEvents: { rate: 3, burst: 60 }, // per second refill, bucket size
  pkEvents: { rate: 2, burst: 40 },
  ipReqs: { rate: 2, burst: 60 },
};
const HEX64 = /^[0-9a-f]{64}$/;
const HEX128 = /^[0-9a-f]{128}$/;

const buckets = new Map(); // key -> {tokens, at}
function take(key, { rate, burst }) {
  const now = Date.now() / 1000;
  let b = buckets.get(key);
  if (!b) {
    b = { tokens: burst, at: now };
    buckets.set(key, b);
  }
  b.tokens = Math.min(burst, b.tokens + (now - b.at) * rate);
  b.at = now;
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}
setInterval(() => {
  const now = Date.now() / 1000;
  for (const [k, b] of buckets) if (now - b.at > 600) buckets.delete(k);
}, 60_000).unref();

function validEvent(ev) {
  if (!ev || typeof ev !== "object") return "invalid: not an event";
  if (ev.kind !== KIND) return `blocked: this relay only carries kind ${KIND}`;
  if (!HEX64.test(ev.id) || !HEX64.test(ev.pubkey) || !HEX128.test(ev.sig)) return "invalid: bad id/pubkey/sig";
  if (!Number.isInteger(ev.created_at) || typeof ev.content !== "string" || !Array.isArray(ev.tags)) return "invalid: bad fields";
  if (!ev.tags.every((t) => Array.isArray(t) && t.every((x) => typeof x === "string"))) return "invalid: bad tags";
  if (Math.abs(ev.created_at - Date.now() / 1000) > 600) return "invalid: created_at too far from now";
  const id = bytesToHex(sha256(utf8ToBytes(JSON.stringify([0, ev.pubkey, ev.created_at, ev.kind, ev.tags, ev.content]))));
  if (id !== ev.id) return "invalid: id mismatch";
  try {
    if (!schnorr.verify(hexToBytes(ev.sig), hexToBytes(ev.id), hexToBytes(ev.pubkey))) return "invalid: bad signature";
  } catch {
    return "invalid: bad signature";
  }
  return null;
}

function matches(f, ev) {
  if (f.ids && !f.ids.includes(ev.id)) return false;
  if (f.kinds && !f.kinds.includes(ev.kind)) return false;
  if (f.authors && !f.authors.includes(ev.pubkey)) return false;
  if (typeof f.since === "number" && ev.created_at < f.since) return false;
  if (typeof f.until === "number" && ev.created_at > f.until) return false;
  for (const k of Object.keys(f)) {
    if (k[0] !== "#" || k.length !== 2 || !Array.isArray(f[k])) continue;
    const vals = f[k];
    if (!ev.tags.some((t) => t[0] === k[1] && vals.includes(t[1]))) return false;
  }
  return true;
}

const conns = new Set();
const perIp = new Map();
const send = (ws, msg) => {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
};

const server = http.createServer((req, res) => {
  if (req.url === "/healthz") {
    res.writeHead(200, { "content-type": "text/plain" });
    return res.end("ok");
  }
  res.writeHead(200, { "content-type": "application/nostr+json", "access-control-allow-origin": "*" });
  res.end(
    JSON.stringify({
      name: "Buzz signer relay",
      description: "NIP-46 (kind 24133) only. 60s replay buffer, no persistence, no auth, rate limited.",
      supported_nips: [1, 11, 46],
      software: "buzz-signer-relay",
      version: "1.1.0",
      limitation: { max_message_length: MAX_FRAME, max_subscriptions: MAX_SUBS, max_filters: MAX_FILTERS, auth_required: false, restricted_writes: true },
    }),
  );
});

const wss = new WebSocketServer({ server, maxPayload: MAX_FRAME, perMessageDeflate: false });
wss.on("connection", (ws, req) => {
  const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "?").split(",")[0].trim();
  const n = (perIp.get(ip) || 0) + 1;
  if (n > MAX_CONNS_PER_IP) {
    ws.close(1008, "too many connections");
    return;
  }
  perIp.set(ip, n);
  ws.ip = ip;
  ws.subs = new Map();
  ws.alive = true;
  ws.openedAt = Date.now();
  ws.stats = { events: 0, reqs: 0, replayed: 0, limited: 0 };
  conns.add(ws);
  ws.on("pong", () => (ws.alive = true));
  ws.on("close", (code, reason) => {
    log({
      msg: "close",
      ip: ipTag(ip),
      code,
      reason: String(reason || "").slice(0, 60),
      by: ws.terminatedBy || "peer",
      secs: Math.round((Date.now() - ws.openedAt) / 1000),
      ...ws.stats,
    });
    conns.delete(ws);
    const m = (perIp.get(ip) || 1) - 1;
    if (m <= 0) perIp.delete(ip);
    else perIp.set(ip, m);
  });
  ws.on("error", () => {});
  ws.on("message", (data, isBinary) => {
    ws.alive = true;
    if (isBinary) return;
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return send(ws, ["NOTICE", "invalid: not JSON"]);
    }
    if (!Array.isArray(msg)) return send(ws, ["NOTICE", "invalid: not an array"]);
    const [type] = msg;
    const limited = (what) => {
      ws.stats.limited++;
      if (ws.stats.limited <= 3 || ws.stats.limited % 50 === 0) log({ msg: "rate-limited", ip: ipTag(ip), what, n: ws.stats.limited });
    };
    if (type === "EVENT") {
      ws.stats.events++;
      const ev = msg[1];
      const id = ev && typeof ev.id === "string" ? ev.id : "";
      if (!take(`ip:${ip}`, LIMITS.ipEvents)) {
        limited("ip-events");
        return send(ws, ["OK", id, false, "rate-limited: slow down"]);
      }
      const err = validEvent(ev);
      if (err) return send(ws, ["OK", id, false, err]);
      if (!take(`pk:${ev.pubkey}`, LIMITS.pkEvents)) {
        limited("pubkey-events");
        return send(ws, ["OK", id, false, "rate-limited: slow down"]);
      }
      remember(ev);
      for (const c of conns) for (const [sid, filters] of c.subs) if (filters.some((f) => matches(f, ev))) send(c, ["EVENT", sid, ev]);
      return send(ws, ["OK", id, true, ""]);
    }
    if (type === "REQ") {
      const sid = msg[1];
      if (typeof sid !== "string" || sid.length === 0 || sid.length > 64) return send(ws, ["NOTICE", "invalid: bad subscription id"]);
      ws.stats.reqs++;
      if (!take(`req:${ip}`, LIMITS.ipReqs)) {
        limited("reqs");
        return send(ws, ["CLOSED", sid, "rate-limited: slow down"]);
      }
      const filters = msg.slice(2).filter((f) => f && typeof f === "object" && !Array.isArray(f));
      if (filters.length === 0 || filters.length > MAX_FILTERS) return send(ws, ["CLOSED", sid, "invalid: bad filters"]);
      if (!ws.subs.has(sid) && ws.subs.size >= MAX_SUBS) return send(ws, ["CLOSED", sid, "blocked: too many subscriptions"]);
      ws.subs.set(sid, filters);
      // Replay what this client missed in the last REPLAY_MS (only "#p"-addressed filters; at most 200 events).
      const cutoff = Date.now() - REPLAY_MS;
      let sent = 0;
      for (const { ev, at } of replay) {
        if (sent >= 200) break;
        if (at < cutoff) continue;
        if (filters.some((f) => f["#p"] && matches(f, ev))) {
          send(ws, ["EVENT", sid, ev]);
          sent++;
        }
      }
      ws.stats.replayed += sent;
      return send(ws, ["EOSE", sid]);
    }
    if (type === "CLOSE") {
      ws.subs.delete(msg[1]);
      return;
    }
    if (type === "AUTH") return;
    send(ws, ["NOTICE", "invalid: unsupported message"]);
  });
});

setInterval(() => {
  for (const ws of conns) {
    if (!ws.alive) {
      ws.terminatedBy = "missed-pong";
      ws.terminate();
      continue;
    }
    ws.alive = false;
    try {
      ws.ping();
    } catch {
      /* gone */
    }
  }
}, PING_MS).unref();

server.listen(PORT, () => console.log(`signer relay listening on :${PORT}`));
const stop = () => {
  for (const ws of conns) ws.close(1001, "restarting");
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
