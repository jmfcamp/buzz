/**
 * Retry policy for relay-backed queries. Rate limits, timeouts and dropped
 * subscriptions are transient: keep retrying with capped backoff instead of
 * giving up after a few attempts. Other errors get a couple of tries.
 */
const TRANSIENT =
  /rate-limited|quota exceeded|retry in \d+s|timed out|timeout|closed the history subscription|superseded|not connected|connection/i;

export function isTransientRelayError(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error ?? "");
  return TRANSIENT.test(text);
}

export function relayReadRetry(failureCount: number, error: unknown): boolean {
  if (isTransientRelayError(error)) return failureCount < 30;
  return failureCount < 2;
}

export function relayReadRetryDelay(attempt: number, error?: unknown): number {
  const text = error instanceof Error ? error.message : String(error ?? "");
  const hint = /retry in (\d+)s/i.exec(text);
  const base = hint ? Number(hint[1]) * 1000 : Math.min(30_000, 1_000 * 2 ** attempt);
  return base + Math.floor(Math.random() * 1_000);
}
