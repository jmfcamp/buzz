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

const CONNECTION_STATE =
  /superseded|not connected|connection|closed the history subscription/i;

/**
 * Backoff tuned for boot: the first retries are sub-second so a read that
 * failed only because the socket was still (re)connecting lands as soon as
 * it can. Connection-state errors retry every ≤2 s; rate limits honor the
 * relay's "retry in Ns" hint; anything else backs off to at most 8 s.
 */
export function relayReadRetryDelay(attempt: number, error?: unknown): number {
  const text = error instanceof Error ? error.message : String(error ?? "");
  const hint = /retry in (\d+)s/i.exec(text);
  let base: number;
  if (hint) base = Number(hint[1]) * 1000;
  else if (CONNECTION_STATE.test(text))
    base = Math.min(2_000, 300 * (attempt + 1));
  else base = Math.min(8_000, 500 * 2 ** attempt);
  return base + Math.floor(Math.random() * 250);
}
