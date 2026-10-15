// Channels set to "All messages" and explicitly followed threads, fed from
// the app shell into the web push lease. Kept dependency-free so shared app
// code can update it without pulling in the push client.
export type PushInterest = { channels: string[]; roots: string[] };

/** Relay lease limits: #h <= 50 values, other tag filters <= 20 values. */
export const MAX_PUSH_CHANNELS = 50;
export const MAX_PUSH_ROOTS = 20;

let interest: PushInterest = { channels: [], roots: [] };
const listeners = new Set<() => void>();

export function getPushInterest(): PushInterest {
  return interest;
}

export function setPushInterest(next: {
  channels: Iterable<string>;
  roots: Iterable<string>;
}): boolean {
  const channels = [...new Set(next.channels)].sort().slice(0, MAX_PUSH_CHANNELS);
  const roots = [...new Set(next.roots)].sort().slice(0, MAX_PUSH_ROOTS);
  if (
    channels.join(",") === interest.channels.join(",") &&
    roots.join(",") === interest.roots.join(",")
  )
    return false;
  interest = { channels, roots };
  for (const listener of listeners) listener();
  return true;
}

export function onPushInterestChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
