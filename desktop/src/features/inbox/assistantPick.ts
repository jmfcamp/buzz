// Which agent is "your Assistant", synced across devices in the inbox-state doc (kind 30078, d=buzz:inbox-state).
// Stored as an `as:<agent pubkey>` id in the existing `followed` lane (same trick as `ch:` channel notify ids), so
// older clients keep the entry when they republish instead of dropping an unknown lane. The newest live entry wins;
// switching writes a tombstone for the old one.
import * as React from "react";

import {
  ASSISTANT_PICK_PREFIX,
  assistantFromDoc,
  HEX64,
  isAssistantPickId,
} from "./assistantPickDoc";

export { ASSISTANT_PICK_PREFIX, assistantFromDoc, isAssistantPickId };
import {
  currentInboxStateDoc,
  INBOX_STATE_APPLIED_EVENT,
  recordInboxState,
} from "./inboxStateSync";

export const ASSISTANT_PICK_CHANGED_EVENT = "buzz-assistant-pick-changed";

/** Pick (or clear, with null) the assistant for `ownerPubkey`. No-op until the inbox-state sync is running. */
export function setSyncedAssistant(ownerPubkey: string | undefined, agentPubkey: string | null) {
  const doc = currentInboxStateDoc(ownerPubkey);
  if (!doc) return false;
  const next = agentPubkey ? agentPubkey.trim().toLowerCase() : null;
  if (next && !HEX64.test(next)) return false;
  for (const [id, e] of Object.entries(doc.lanes.followed)) {
    if (e.on && isAssistantPickId(id) && id !== `${ASSISTANT_PICK_PREFIX}${next}`) {
      recordInboxState(ownerPubkey, "followed", id, false);
    }
  }
  if (next) recordInboxState(ownerPubkey, "followed", `${ASSISTANT_PICK_PREFIX}${next}`, true);
  if (typeof window !== "undefined") window.dispatchEvent(new Event(ASSISTANT_PICK_CHANGED_EVENT));
  return true;
}

export function readSyncedAssistant(ownerPubkey: string | undefined) {
  return assistantFromDoc(currentInboxStateDoc(ownerPubkey));
}

export function useSyncedAssistant(ownerPubkey: string | undefined): string | null {
  const [value, setValue] = React.useState(() => readSyncedAssistant(ownerPubkey));
  React.useEffect(() => {
    const update = () => setValue(readSyncedAssistant(ownerPubkey));
    update();
    window.addEventListener(INBOX_STATE_APPLIED_EVENT, update);
    window.addEventListener(ASSISTANT_PICK_CHANGED_EVENT, update);
    // The sync may start after mount; re-read a few times early on.
    const t = window.setInterval(update, 5_000);
    return () => {
      window.removeEventListener(INBOX_STATE_APPLIED_EVENT, update);
      window.removeEventListener(ASSISTANT_PICK_CHANGED_EVENT, update);
      window.clearInterval(t);
    };
  }, [ownerPubkey]);
  return value;
}
