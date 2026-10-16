/**
 * Client-side pacing for relay frames. The relay admits
 * BUZZ_RATE_LIMIT_HUMAN_WS_EVENTS_PER_SEC frames/s per pubkey (prod: 40/s,
 * i.e. 200 per 5 s window) shared across that key's connections. A startup
 * opens roughly one REQ per channel (~130 for JM) plus project/section reads.
 *
 * Budget per connection: a 120-frame burst (the whole cold start goes out at
 * once) refilling at 16/s, so one connection never exceeds 200 frames in any
 * 5 s window and the others still get headroom.
 *
 * Subscription control frames (REQ/CLOSE/COUNT) are released ahead of
 * queued publishes, so a burst of EVENTs can never delay sidebar/channel
 * reads. AUTH is never paced.
 */
const CAPACITY = 120;
const REFILL_PER_SEC = 16;

export type RelayFramePriority = "control" | "publish";

let tokens = CAPACITY;
let last = Date.now();
const controlQueue: Array<() => void> = [];
const publishQueue: Array<() => void> = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function refill(now: number) {
  tokens = Math.min(CAPACITY, tokens + ((now - last) / 1000) * REFILL_PER_SEC);
  last = now;
}

function pump() {
  timer = null;
  refill(Date.now());
  while (tokens >= 1) {
    const next = controlQueue.shift() ?? publishQueue.shift();
    if (!next) return;
    tokens -= 1;
    next();
  }
  if (controlQueue.length > 0 || publishQueue.length > 0) {
    const waitMs = Math.ceil(((1 - tokens) / REFILL_PER_SEC) * 1000);
    timer = setTimeout(pump, waitMs);
  }
}

/**
 * Resolve when this frame may be sent. Within a priority, frames are
 * released in call order; control frames always go before publishes.
 * Under budget this resolves without any timer delay.
 */
export function paceRelayFrame(
  priority: RelayFramePriority = "control",
): Promise<void> {
  refill(Date.now());
  if (
    tokens >= 1 &&
    controlQueue.length === 0 &&
    (priority === "control" || publishQueue.length === 0)
  ) {
    tokens -= 1;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    (priority === "control" ? controlQueue : publishQueue).push(resolve);
    if (timer === null) pump();
  });
}

/** AUTH must never wait behind queued reads, or the connection stalls. */
export function shouldPaceFrame(payload: unknown[]): boolean {
  return payload[0] !== "AUTH";
}

export function framePriority(payload: unknown[]): RelayFramePriority {
  return payload[0] === "EVENT" ? "publish" : "control";
}

/** Test hook. */
export function resetRelayFramePacer() {
  if (timer !== null) clearTimeout(timer);
  timer = null;
  tokens = CAPACITY;
  last = Date.now();
  controlQueue.length = 0;
  publishQueue.length = 0;
}
