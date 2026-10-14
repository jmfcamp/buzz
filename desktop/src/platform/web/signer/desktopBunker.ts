// Web side of "sign in with your desktop": a NIP-46 session to the Hula Buzz desktop's built-in bunker over the Hula
// signer relay. It is registered as the desktop route in directRoute.ts (after Direct), so every signature goes to the
// desktop first and falls back to the remote signer (Clave) only while the desktop doesn't answer; when no remote signer
// is paired the app is read-only until the desktop is back.
//  - status: "unknown" (just started: requests are tried), "online" (answered recently), "offline" (missed a check:
//    requests fail fast so the fallback is instant), "revoked" (desktop revoked this browser: session dropped).
//  - A check (get_public_key) runs at start, every 30s while visible, on return to the app and when the network returns.
// Only the browser's NIP-46 CLIENT key is stored here (IndexedDB); the account key stays on the desktop.
import { bytesToHex } from "@noble/hashes/utils.js";
import { generateSecretKey } from "nostr-tools";
import {
  BUNKER_UNPAIR_METHOD,
  bunkerAutoKind,
  isDesktopBunkerUri,
} from "@/features/bridge/bunkerProto";
import { notifyDirectSignerChange, setBunkerSigner } from "./directRoute";
import { Nip46Client, Nip46Error, parseBunkerUrl } from "./nip46";
import {
  clearDesktopBunkerSession,
  loadDesktopBunkerSession,
  saveDesktopBunkerSession,
  type DesktopBunkerSession,
} from "./nip46Store";
import type { SignedEvent } from "./types";
import { kbNote } from "../kbDebug/kbDebug";

export type BunkerStatus =
  | "none"
  | "unknown"
  | "online"
  | "offline"
  | "revoked";
const CHECK_EVERY_MS = 30_000;
const CHECK_TIMEOUT_MS = 8_000;
/** Consecutive failed checks before the desktop counts as offline (one miss = iOS froze a socket, a relay hiccup…). */
const MISSES_BEFORE_OFFLINE = 2;
const PAIR_TIMEOUT_MS = 120_000; // the person has to click Allow on the desktop
const SIGN_TIMEOUT_MS = 90_000; // instrument.ts applies the real (shorter) limit per kind

let client: Nip46Client | null = null;
let session: DesktopBunkerSession | null = null;
let status: BunkerStatus = "none";
let timer: ReturnType<typeof setInterval> | undefined;
let checking: Promise<boolean> | null = null;
let misses = 0;
const listeners = new Set<() => void>();

const setStatus = (s: BunkerStatus) => {
  if (s === status) return;
  kbNote(
    `desktop signer ${status} → ${s}${misses ? ` (misses ${misses})` : ""}`,
  );
  status = s;
  notifyDirectSignerChange();
  for (const l of listeners) l();
};
export const desktopBunkerStatus = () => status;
export const hasDesktopBunker = () => !!session;
export const desktopBunkerLabel = () => session?.label ?? "your desktop";
export const onDesktopBunkerChange = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};
export { isDesktopBunkerUri };

const browserName = () => {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const dev = /iPad/.test(ua)
    ? "iPad"
    : /iPhone/.test(ua)
      ? "iPhone"
      : /Android/.test(ua)
        ? "Android"
        : /Mac OS X/.test(ua)
          ? "Mac"
          : /Windows/.test(ua)
            ? "Windows"
            : "Browser";
  const app =
    typeof matchMedia !== "undefined" &&
    matchMedia("(display-mode: standalone)").matches
      ? "Hula Buzz app"
      : "web";
  return `${dev} (${app})`;
};

function register(c: Nip46Client) {
  setBunkerSigner({
    // Only "online" counts as live (remote signer may park, cold-start gate passes); "unknown" requests are still tried.
    active: () => status === "online",
    isAuto: (k) => bunkerAutoKind(k),
    isPaired: () => !!session,
    sign: async (ev) => {
      if (status === "offline" || status === "revoked") {
        void check();
        throw new Error("desktop offline");
      }
      try {
        const res = await c.request(
          "sign_event",
          [JSON.stringify(ev)],
          SIGN_TIMEOUT_MS,
        );
        misses = 0;
        setStatus("online");
        return JSON.parse(res) as SignedEvent; // instrument.ts verifies id, sig and pubkey
      } catch (e) {
        onFailure(e);
        throw e;
      }
    },
    crypt: async (op, peer, text) => {
      try {
        const out = await c.request(op, [peer, text], SIGN_TIMEOUT_MS);
        misses = 0;
        setStatus("online");
        return out;
      } catch (e) {
        onFailure(e);
        throw e;
      }
    },
  });
}

function onFailure(e: unknown) {
  if (
    e instanceof Nip46Error &&
    e.code === "rejected" &&
    /revoked/i.test(e.message)
  ) {
    void dropSession("revoked");
    return;
  }
  // A single timeout isn't "offline": the next check decides (see check()).
}

/**
 * One liveness check: true when the desktop answered with the expected account. A miss first rebuilds the signer-relay
 * sockets and asks again; only MISSES_BEFORE_OFFLINE failed checks in a row mark the desktop offline (fast fallback).
 */
export function check(timeoutMs = CHECK_TIMEOUT_MS): Promise<boolean> {
  const c = client;
  const s = session;
  if (!c || !s) return Promise.resolve(false);
  checking ??= (async () => {
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        if (attempt === 1) c.reconnectAll(true);
        try {
          const pk = await c.request("get_public_key", [], timeoutMs);
          if (pk !== s.userPubkey) {
            await dropSession("revoked");
            return false;
          }
          misses = 0;
          setStatus("online");
          return true;
        } catch (e) {
          onFailure(e);
          if (!session) return false; // revoked
        }
      }
      misses++;
      if (misses >= MISSES_BEFORE_OFFLINE) setStatus("offline");
      return false;
    } finally {
      checking = null;
    }
  })();
  return checking;
}

const onWake = () => {
  if (document.visibilityState !== "visible" || !client) return;
  // iOS froze the signer-relay socket in the background: replace it first, then check.
  client.reconnectAll(true);
  void check();
};
function startLoop() {
  clearInterval(timer);
  timer = setInterval(() => {
    if (document.visibilityState === "visible") void check();
  }, CHECK_EVERY_MS);
  document.addEventListener("visibilitychange", onWake);
  window.addEventListener("online", onWake);
  window.addEventListener("pageshow", onWake);
}
function stopLoop() {
  clearInterval(timer);
  document.removeEventListener("visibilitychange", onWake);
  window.removeEventListener("online", onWake);
  window.removeEventListener("pageshow", onWake);
}

function begin(s: DesktopBunkerSession) {
  client?.stop();
  session = s;
  const c = new Nip46Client(s.clientSecret, s.remotePubkey, s.relays);
  c.quiet = true;
  c.start();
  client = c;
  register(c);
  misses = 0;
  setStatus("unknown");
  startLoop();
}

/**
 * Resume the saved desktop bunker for `userPubkey` (any session kind). Doesn't wait for the network: the first check
 * runs in the background; use warmDesktopBunker() to wait for it.
 */
export async function resumeDesktopBunker(
  userPubkey: string,
): Promise<boolean> {
  const s = await loadDesktopBunkerSession();
  if (!s) return false;
  if (s.userPubkey !== userPubkey) {
    await clearDesktopBunkerSession(); // a different account signed in here
    return false;
  }
  begin(s);
  void check();
  return true;
}

/** Wait (up to `timeoutMs`) until the desktop answered, e.g. before the relay AUTH on cold start. */
export async function warmDesktopBunker(timeoutMs = 5000): Promise<boolean> {
  if (!session) return false;
  if (status === "online" && misses === 0) return true;
  return check(timeoutMs);
}

/**
 * Pair with a desktop sign-in code (bunker://…&buzz=desktop). Resolves with the account pubkey once the desktop clicked
 * Allow. `expectPubkey`: when already signed in, the desktop must be the same account.
 */
export async function pairDesktopBunker(
  code: string,
  expectPubkey?: string,
): Promise<string> {
  const b = parseBunkerUrl(code);
  const c = new Nip46Client(
    bytesToHex(generateSecretKey()),
    b.remotePubkey,
    b.relays,
  );
  c.quiet = true;
  c.start();
  try {
    const label = browserName();
    const r = await c.request(
      "connect",
      [b.remotePubkey, b.secret ?? "", "", label],
      PAIR_TIMEOUT_MS,
    );
    if (b.secret && r !== "ack" && r !== b.secret)
      throw new Nip46Error(
        "protocol",
        "Your desktop gave an unexpected answer.",
      );
    const userPubkey = await c.request("get_public_key", [], 20_000);
    if (!/^[0-9a-f]{64}$/.test(userPubkey))
      throw new Nip46Error(
        "protocol",
        "Your desktop returned an invalid account.",
      );
    if (expectPubkey && userPubkey !== expectPubkey) {
      void c.request(BUNKER_UNPAIR_METHOD, [], 5000).catch(() => {});
      throw new Nip46Error(
        "protocol",
        "That desktop is signed in to a different account than this app.",
      );
    }
    const s: DesktopBunkerSession = {
      clientSecret: c.clientSecret,
      remotePubkey: b.remotePubkey,
      relays: b.relays,
      userPubkey,
      label: "your desktop",
    };
    await saveDesktopBunkerSession(s);
    c.stop();
    begin(s);
    setStatus("online");
    return userPubkey;
  } catch (e) {
    c.stop();
    throw e;
  }
}

async function dropSession(why: "revoked" | "forgotten") {
  stopLoop();
  client?.stop();
  client = null;
  session = null;
  setBunkerSigner(null);
  setStatus(why === "revoked" ? "revoked" : "none");
  await clearDesktopBunkerSession();
}

/** Forget the desktop here and tell it to revoke this browser (best effort when it's offline). */
export async function forgetDesktopBunker(): Promise<void> {
  const c = client;
  if (c) await c.request(BUNKER_UNPAIR_METHOD, [], 4000).catch(() => {});
  await dropSession("forgotten");
}
