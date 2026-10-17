// Pure builders for the relay-readable push prefs (`d=buzz:push-prefs`); published by syncedPrefs.ts.

/** The four notification types that also drive push and the sound rows. */
export const SYNCED_SLOTS = [
  "dm",
  "mention",
  "thread_reply",
  "needs_action",
] as const;
export type SyncedSlot = (typeof SYNCED_SLOTS)[number];

/**
 * Push classes beyond the four sound slots that the relay push matcher can silence. `reminder` matches the
 * relay's existing `reminder` lease class (honored by any relay). `assistant_reply` is honored by relays that
 * advertise it (`push.pref_features` in NIP-11); older relays ignore the unknown entry and the extra key.
 */
export const PUSH_EXTRA_CLASSES = ["reminder", "assistant_reply"] as const;
export type PushExtraClass = (typeof PUSH_EXTRA_CLASSES)[number];
export type PushOffClass = SyncedSlot | PushExtraClass;

export type PushPrefsPayload = {
  v: 1;
  off: PushOffClass[];
  muted_channels: string[];
  muted_threads: string[];
  /** The member's assistant agent(s): their replies in your DMs are the `assistant_reply` class. */
  assistant_pubkeys?: string[];
};

const MAX_MUTES = 500;

export function buildPushPrefsPayload(
  slots: Record<SyncedSlot, boolean>,
  mutedChannelIds: Iterable<string>,
  mutedRootIds: Iterable<string>,
  extra: {
    events?: Partial<Record<PushExtraClass, boolean>>;
    assistantPubkey?: string | null;
  } = {},
): PushPrefsPayload {
  const off: PushOffClass[] = SYNCED_SLOTS.filter((s) => !slots[s]);
  for (const c of PUSH_EXTRA_CLASSES)
    if (extra.events?.[c] === false) off.push(c);
  const assistant = extra.assistantPubkey?.trim().toLowerCase();
  return {
    v: 1,
    off,
    muted_channels: [...new Set(mutedChannelIds)].sort().slice(0, MAX_MUTES),
    muted_threads: [...new Set(mutedRootIds)].sort().slice(0, MAX_MUTES),
    ...(assistant && /^[0-9a-f]{64}$/.test(assistant)
      ? { assistant_pubkeys: [assistant] }
      : {}),
  };
}
