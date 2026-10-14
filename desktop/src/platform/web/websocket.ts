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
};
const sockets = new Map<number, Entry>();
let next = 1;
let hbSeq = 0;

export const HEARTBEAT_PREFIX = "__buzz_hb_";
const IDLE_PROBE_MS = 25_000; // probe a socket that has been silent this long
const PROBE_TIMEOUT_MS = 6_000; // ...and give it this long to answer
const ZERO_ID = "0".repeat(64);

function report(id: number, e: Entry, code: number, reason: string) {
  if (e.dead) return;
  e.dead = true;
  // Diagnostics overlay (Settings → Appearance): why each relay socket ended (heartbeat timeout, offline, server close…).
  kbNote(`ws#${id} closed ${code} ${reason || ""} ${e.authed ? "authed" : "unauthed"} age ${Math.round((Date.now() - e.openedAt) / 1000)}s`);
  for (const f of deadListeners.get(e) ?? []) f();
  deadListeners.delete(e);
  e.side.clear();
  if (e.probe) clearTimeout(e.probe);
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
    const e: Entry = { ws, url, authId: null, authed: false, side: new Map(), sink, lastRx: Date.now(), probe: null, dead: false, openedAt: Date.now() };
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
  e.ws.send(message.data);
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
      send: (raw) => e.ws.send(raw),
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
  sockets.delete(id);
  e.ws.close();
}
export function wsCloseAll() {
  for (const id of [...sockets.keys()]) wsClose(id);
}
