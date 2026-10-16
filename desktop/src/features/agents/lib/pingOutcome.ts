import type { ControlResultFrame } from "@/shared/api/types";

export type PingOutcome =
  | { kind: "up"; ms: number }
  | { kind: "timeout" };

export const PING_TIMEOUT_MS = 10_000;

/** Resolve on the matching `pong` (by requestId) or on timeout. Send errors reject. */
export async function awaitPingOutcome({
  requestId,
  subscribe,
  sendPing,
  scheduleTimeout,
  now,
}: {
  requestId: string;
  subscribe: (listener: (frame: ControlResultFrame) => void) => () => void;
  sendPing: () => Promise<void>;
  scheduleTimeout: (onTimeout: () => void) => () => void;
  now: () => number;
}): Promise<PingOutcome> {
  const startedAt = now();
  let settled = false;
  let unsubscribe = () => {};
  let cancelTimeout = () => {};
  return new Promise<PingOutcome>((resolve, reject) => {
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      unsubscribe();
      cancelTimeout();
      fn();
    };
    unsubscribe = subscribe((frame) => {
      if (frame.type !== "ping" || frame.requestId !== requestId) return;
      if (frame.status !== "pong") return;
      finish(() => resolve({ kind: "up", ms: Math.max(0, Math.round(now() - startedAt)) }));
    });
    cancelTimeout = scheduleTimeout(() => finish(() => resolve({ kind: "timeout" })));
    sendPing().catch((error) => finish(() => reject(error)));
  });
}
