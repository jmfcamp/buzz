// Browser implementation of tauri-plugin-websocket as used by relayClientSession.
//
// Liveness: iOS suspends a backgrounded PWA and its sockets can come back "open" but dead (no close event ever fires), so
// the relay session would believe it is connected and the user had to refresh. Every socket is probed with a tiny
// heartbeat REQ (answered by any NIP-01 relay with EOSE) when the app resumes and whenever it has been quiet; a socket
// that doesn't answer in time is torn down and reported closed, which hands control to the session's own reconnect
// (exponential backoff with jitter, NIP-42 re-auth and `since`-backfilled re-subscription).
import { onOffline, onResume, isPageVisible } from "@/shared/lib/resumeSignals";
import { kbNote } from "./kbDebug/kbDebug";

type Sink = { onmessage: (m: unknown) => void };
type Entry = {
  ws: WebSocket;
  url: string;
  /** NIP-42: id of the AUTH event the session sent, and whether the relay accepted it */
  authId: string | null;
  authed: boolean;
  /** side-channel handlers keyed by subscription id (REQ) or event id (EVENT → OK) */
  side: Map<string, (frame: unknown[]) => void>;
  sink: Sink;
  lastRx: number;
  probe: ReturnType<typeof setTimeout> | null;
  dead: boolean;
  openedAt: number;
  /** outbound pacing (relay admission: ~10 WS frames/s per human principal) */
  q: string[];
  tokens: number;
  refillAt: number;
  pausedUntil: number;
  drain: ReturnType<typeof setTimeout> | null;
};
const sockets = new Map<number, Entry>();
let next = 1;
let hbSeq = 0;

export const HEARTBEAT_PREFIX = "__buzz_hb_";
const IDLE_PROBE_MS = 25_000; // probe a socket that has been silent this long
const PROBE_TIMEOUT_MS = 6_000; // ...and give it this long to answer
const ZERO_ID = "0".repeat(64);

// Outbound pacing. The relay admits ~10 WS operations per second per human principal and answers the excess with
// CLOSED "rate-limited: quota exceeded; retry in Ns". After a reconnect the session replays every live subscription and
// every mounted view fires its one-shot reads at once, which produced hundreds of rejected REQs per connection. All REQ
// and EVENT frames now go through a per-socket token bucket (burst 6, 6/s), duplicates collapse while queued, a CLOSE
// cancels a still-queued REQ, and a rate-limited CLOSED/NOTICE pauses the queue for the relay's retry hint.
export const PACE_BURST = 6;
export const PACE_PER_SEC = 6;
const MAX_PAUSE_MS = 60_000;

function frameKey(raw: string): { type: string; key: string } | null {
  const m = /^\["(REQ|CLOSE|EVENT)",\s*"([^"]*)"/.exec(raw);
  if (m) return { type: m[1], key: m[2] };
  if (raw.startsWith('["EVENT"')) return { type: "EVENT", key: "" };
  return null;
}

function schedule(e: Entry, ms: number) {
  e.drain = setTimeout(() => {
    e.drain = null;
    pump(e);
  }, ms);
}

function pump(e: Entry) {
  if (e.drain) return;
  const now = Date.now();
  if (e.dead || e.ws.readyState !== WebSocket.OPEN) {
    if (e.dead) e.q.length = 0;
    else if (e.q.length) schedule(e, 100);
    return;
  }
  if (now < e.pausedUntil) {
    schedule(e, e.pausedUntil - now);
    return;
  }
  e.tokens = Math.min(PACE_BURST, e.tokens + ((now - e.refillAt) / 1000) * PACE_PER_SEC);
  e.refillAt = now;
  while (e.q.length && e.tokens >= 1) {
    const raw = e.q.shift() as string;
    e.tokens -= 1;
    try {
      e.ws.send(raw);
    } catch {
      /* socket closing; report() follows */
    }
  }
  if (e.q.length)
    schedule(e, Math.ceil(((1 - e.tokens) / PACE_PER_SEC) * 1000));
}

/** Queue a frame for paced send. REQ/EVENT are paced and deduped; CLOSE drops a queued REQ for the same sub. */
function pacedSend(e: Entry, raw: string) {
  const f = frameKey(raw);
  if (!f) {
    e.ws.send(raw); // AUTH and anything unrecognised go straight out
    return;
  }
  if (f.type === "CLOSE") {
    const i = e.q.findIndex((r) => frameKey(r)?.type === "REQ" && frameKey(r)?.key === f.key);
    if (i >= 0) {
      e.q.splice(i, 1); // the relay never saw this REQ: nothing to close
      return;
    }
    e.ws.send(raw);
    return;
  }
  if (f.type === "REQ") {
    const i = e.q.findIndex((r) => frameKey(r)?.type === "REQ" && frameKey(r)?.key === f.key);
    if (i >= 0) {
      e.q[i] = raw; // same subscription re-requested before it went out: send only the latest filter
      return;
    }
  } else if (e.q.includes(raw)) return; // identical EVENT already queued
  e.q.push(raw);
  pump(e);
}

/** Relay back-pressure on this socket: hold the queue for the hinted window. */
function noteBackpressure(e: Entry, parsed: unknown[]) {
  const msg = parsed[0] === "CLOSED" ? parsed[2] : parsed[0] === "NOTICE" ? parsed[1] : parsed[0] === "OK" && parsed[2] === false ? parsed[3] : null;
  if (typeof msg !== "string" || !/rate-limited|quota exceeded/i.test(msg)) return;
  const hint = /retry in (\d+)s/i.exec(msg);
  const ms = Math.min(MAX_PAUSE_MS, (hint ? Number(hint[1]) : 5) * 1000);
  e.pausedUntil = Math.max(e.pausedUntil, Date.now() + ms);
  e.tokens = 0;
}

function report(id: number, e: Entry, code: number, reason: string) {
  if (e.dead) return;
  e.dead = true;
  // Diagnostics overlay (Settings → Appearance): why each relay socket ended (heartbeat timeout, offline, server close…).
  kbNote(`ws#${id} closed ${code} ${reason || ""} ${e.authed ? "authed" : "unauthed"} age ${Math.round((Date.now() - e.openedAt) / 1000)}s`);
  for (const f of deadListeners.get(e) ?? []) f();
  deadListeners.delete(e);
  e.side.clear();
  if (e.probe) clearTimeout(e.probe);
  if (e.drain) clearTimeout(e.drain);
  e.q.length = 0;
  sockets.delete(id);
  e.sink.onmessage({ type: "Close", data: { code, reason } });
}

function kill(id: number, e: Entry, reason: string) {
  try {
    e.ws.close(4000, reason);
  } catch {
    /* already closing */
  }
  report(id, e, 4000, reason); // don't wait for onclose: a frozen socket may never deliver it
}

/** Send a heartbeat REQ; if nothing at all arrives within the timeout the socket is dead. */
export function probeSocket(id: number, timeoutMs = PROBE_TIMEOUT_MS) {
  const e = sockets.get(id);
  if (!e || e.dead || e.probe) return;
  if (e.ws.readyState !== WebSocket.OPEN) {
    if (e.ws.readyState !== WebSocket.CONNECTING)
      kill(id, e, "socket not open");
    return;
  }
  const sub = `${HEARTBEAT_PREFIX}${++hbSeq}`;
  const sentAt = Date.now();
  try {
    e.ws.send(JSON.stringify(["REQ", sub, { ids: [ZERO_ID], limit: 1 }]));
  } catch {
    kill(id, e, "heartbeat send failed");
    return;
  }
  e.probe = setTimeout(() => {
    e.probe = null;
    if (e.lastRx < sentAt) kill(id, e, "heartbeat timeout");
  }, timeoutMs);
}

export function probeAllSockets() {
  for (const id of [...sockets.keys()]) probeSocket(id);
}

let timersInstalled = false;
function installTimers() {
  if (timersInstalled || typeof window === "undefined") return;
  timersInstalled = true;
  onResume(probeAllSockets);
  onOffline(() => {
    for (const [id, e] of [...sockets]) kill(id, e, "offline");
  });
  setInterval(() => {
    if (!isPageVisible()) return;
    const now = Date.now();
    for (const [id, e] of sockets)
      if (now - e.lastRx > IDLE_PROBE_MS) probeSocket(id);
  }, 10_000);
}

/** Heartbeat replies are ours: swallow them so the session never sees an unknown subscription. */
function isHeartbeatFrame(data: string): boolean {
  if (!data.includes(HEARTBEAT_PREFIX)) return false;
  try {
    const m = JSON.parse(data);
    return (
      Array.isArray(m) &&
      typeof m[1] === "string" &&
      m[1].startsWith(HEARTBEAT_PREFIX)
    );
  } catch {
    return false;
  }
}

export function wsConnect(url: string, sink: Sink): Promise<number> {
  installTimers();
  return new Promise((resolve, reject) => {
    const id = next++;
    const ws = new WebSocket(url);
    const e: Entry = { ws, url, authId: null, authed: false, side: new Map(), sink, lastRx: Date.now(), probe: null, dead: false, openedAt: Date.now(), q: [], tokens: PACE_BURST, refillAt: Date.now(), pausedUntil: 0, drain: null };
    sockets.set(id, e);
    ws.onopen = () => {
      e.lastRx = Date.now();
      resolve(id);
    };
    ws.onerror = () => {
      reject(new Error("WebSocket connection failed"));
      report(id, e, 1006, "error");
    };
    ws.onmessage = (m) => {
      e.lastRx = Date.now();
      const data = typeof m.data === "string" ? m.data : "";
      if (isHeartbeatFrame(data)) {
        const parsed = JSON.parse(data);
        if (parsed[0] === "EOSE" && e.ws.readyState === WebSocket.OPEN)
          e.ws.send(JSON.stringify(["CLOSE", parsed[1]]));
        return;
      }
      if (data.startsWith('["CLOSED"') || data.startsWith('["NOTICE"') || data.startsWith('["OK"')) {
        try {
          noteBackpressure(e, JSON.parse(data));
        } catch {}
      }
      if (data.startsWith('["OK"') || e.side.size) {
        let parsed: unknown[] | null = null;
        try {
          parsed = JSON.parse(data);
        } catch {}
        if (Array.isArray(parsed) && typeof parsed[1] === "string") {
          if (parsed[0] === "OK" && parsed[1] === e.authId) e.authed = parsed[2] === true;
          const h = e.side.get(parsed[1]);
          if (h) {
            h(parsed);
            return; // side-channel frame: never shown to the session
          }
        }
      }
      sink.onmessage({ type: "Text", data });
    };
    ws.onclose = (c) => report(id, e, c.code, c.reason);
  });
}
export function wsSend(id: number, message: { type: string; data: string }) {
  const e = sockets.get(id);
  if (!e) throw new Error(`WebSocket ${id} not found`);
  if (message.data.startsWith('["AUTH"')) {
    try {
      const m = JSON.parse(message.data);
      if (m?.[1]?.id) {
        e.authId = m[1].id;
        e.authed = false;
      }
    } catch {}
  }
  pacedSend(e, message.data);
}

/**
 * The live relay session's socket, once NIP-42 AUTH succeeded on it, as a side channel: one-shot reads and event
 * publishes ride on it instead of a second socket with its own AUTH signature. Frames for side-channel keys never reach
 * the session. Null when no authenticated live socket for `url` is open.
 */
export type SharedSocket = {
  send: (raw: string) => void;
  on: (key: string, handler: (frame: unknown[]) => void) => void;
  off: (key: string) => void;
  onDead: (f: () => void) => () => void;
};
const deadListeners = new Map<Entry, Set<() => void>>();
export function sharedAuthedSocket(url: string): SharedSocket | null {
  const norm = (u: string) => u.replace(/\/+$/, "");
  for (const e of sockets.values()) {
    if (e.dead || !e.authed || e.ws.readyState !== WebSocket.OPEN || norm(e.url) !== norm(url)) continue;
    return {
      send: (raw) => pacedSend(e, raw),
      on: (k, h) => void e.side.set(k, h),
      off: (k) => void e.side.delete(k),
      onDead: (f) => {
        let set = deadListeners.get(e);
        if (!set) deadListeners.set(e, (set = new Set()));
        set.add(f);
        return () => void set?.delete(f);
      },
    };
  }
  return null;
}
export function wsClose(id: number) {
  const e = sockets.get(id);
  if (!e) return;
  if (e.probe) clearTimeout(e.probe);
  if (e.drain) clearTimeout(e.drain);
  e.q.length = 0;
  sockets.delete(id);
  e.ws.close();
}
export function wsCloseAll() {
  for (const id of [...sockets.keys()]) wsClose(id);
}
