// Pubkey of the user's Assistant agent, published by the Assistant feature
// (when built in) so shared code — the Inbox — can route Assistant DM
// messages to the Assistant tab without importing it.
import * as React from "react";

/** Fired on the desktop after the web changed its Assistant over Direct. */
export const ASSISTANT_ASSIGNMENT_CHANGED_EVENT =
  "buzz-assistant-assignment-changed";

let assistantPubkey: string | null = null;
const listeners = new Set<() => void>();

export function setAssistantPubkey(pubkey: string | null | undefined) {
  const next = pubkey ? pubkey.trim().toLowerCase() : null;
  if (next === assistantPubkey) return;
  assistantPubkey = next;
  for (const listener of listeners) listener();
}

export function getAssistantPubkey(): string | null {
  return assistantPubkey;
}

export function useAssistantPubkey(): string | null {
  return React.useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => assistantPubkey,
    () => assistantPubkey,
  );
}
