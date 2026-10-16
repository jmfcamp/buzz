/**
 * Secret-free boot diagnostics (counts, durations, error text only — never
 * event content, keys, or plaintext). Enable on any device by opening the app
 * with `?buzzdiag=1` (persists until `?buzzdiag=0`); an overlay then shows
 * the timeline. Always mirrored to console.info("[buzzdiag]").
 */
export type BootDiagEntry = { t: number; tag: string; msg: string };

const startedAt = Date.now();
const entries: BootDiagEntry[] = [];
const listeners = new Set<() => void>();
const FLAG = "buzz.diag";

export function bootDiagEnabled(): boolean {
  try {
    const q = new URLSearchParams(globalThis.location?.search ?? "").get(
      "buzzdiag",
    );
    if (q === "1") globalThis.localStorage?.setItem(FLAG, "1");
    if (q === "0") globalThis.localStorage?.removeItem(FLAG);
    return globalThis.localStorage?.getItem(FLAG) === "1";
  } catch {
    return false;
  }
}

function safe(text: unknown): string {
  const s = text instanceof Error ? text.message : String(text ?? "");
  // Strip anything that looks like a key/hex blob or nsec/bunker secret.
  return s
    .replace(/nsec1[0-9a-z]+/gi, "nsec1…")
    .replace(/bunker:\/\/\S+/gi, "bunker://…")
    .replace(/[0-9a-f]{32,}/gi, (m) => `${m.slice(0, 8)}…`)
    .slice(0, 200);
}

export function bootDiag(tag: string, msg: unknown): void {
  const entry = { t: Date.now() - startedAt, tag, msg: safe(msg) };
  entries.push(entry);
  if (entries.length > 300) entries.shift();
  try {
    console.info(
      "[buzzdiag]",
      `${(entry.t / 1000).toFixed(2)}s`,
      tag,
      entry.msg,
    );
  } catch {}
  for (const l of listeners) l();
}

/** Time an async step: logs start, ok (with optional summary) or error. */
export async function bootDiagTime<T>(
  tag: string,
  run: () => Promise<T>,
  summarize?: (value: T) => string,
): Promise<T> {
  const t0 = Date.now();
  bootDiag(tag, "start");
  try {
    const value = await run();
    bootDiag(
      tag,
      `ok ${Date.now() - t0}ms${summarize ? ` ${summarize(value)}` : ""}`,
    );
    return value;
  } catch (error) {
    bootDiag(tag, `error ${Date.now() - t0}ms: ${safe(error)}`);
    throw error;
  }
}

export function bootDiagEntries(): readonly BootDiagEntry[] {
  return entries;
}

export function subscribeBootDiag(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
