/**
 * Client-side pacing for relay frames. The relay admits about 10 frames/s per
 * pubkey (50 per 5 s window) across every connection that key has (desktop,
 * web, phone), so a startup that opens one subscription per channel bursts
 * past it and the relay starts refusing reads. Pace this connection to a
 * share of that budget so bursts queue locally instead of being rejected.
 */
const CAPACITY = 20;
const REFILL_PER_SEC = 6;

let tokens = CAPACITY;
let last = Date.now();
let queue: Promise<void> = Promise.resolve();

function refill(now: number) {
  tokens = Math.min(CAPACITY, tokens + ((now - last) / 1000) * REFILL_PER_SEC);
  last = now;
}

/** Resolve when this frame may be sent. Frames are released in call order. */
export function paceRelayFrame(): Promise<void> {
  const next = queue.then(async () => {
    refill(Date.now());
    if (tokens < 1) {
      const waitMs = Math.ceil(((1 - tokens) / REFILL_PER_SEC) * 1000);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      refill(Date.now());
    }
    tokens -= 1;
  });
  queue = next.catch(() => {});
  return next;
}

/** AUTH must never wait behind queued reads, or the connection stalls. */
export function shouldPaceFrame(payload: unknown[]): boolean {
  return payload[0] !== "AUTH";
}

/** Test hook. */
export function resetRelayFramePacer() {
  tokens = CAPACITY;
  last = Date.now();
  queue = Promise.resolve();
}
