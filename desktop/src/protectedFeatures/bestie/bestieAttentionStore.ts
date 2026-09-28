import * as React from "react";

/**
 * Footer-avatar attention for Bestie DM replies.
 * Distinct from wake-nudge (`!` badge): this is a pulsing ring for new agent
 * messages while the popover and Bestie DM thread are both closed.
 */

type Listener = () => void;

const listeners = new Set<Listener>();

let hasUnreadMessage = false;
let popoverOpen = false;
let viewingBestieDm = false;
/** Highest agent message created_at already acknowledged (unix seconds). */
let seenAgentCreatedAt = 0;

function notify() {
  for (const listener of listeners) listener();
}

export function getBestieHasUnreadMessage(): boolean {
  return hasUnreadMessage;
}

export function isBestieSurfaceOpen(): boolean {
  return popoverOpen || viewingBestieDm;
}

export function setBestiePopoverOpen(open: boolean): void {
  if (popoverOpen === open) return;
  popoverOpen = open;
  if (open) {
    clearBestieUnreadMessage();
  }
  notify();
}

export function setBestieViewingDm(viewing: boolean): void {
  if (viewingBestieDm === viewing) return;
  viewingBestieDm = viewing;
  if (viewing) {
    clearBestieUnreadMessage();
  }
  notify();
}

export function clearBestieUnreadMessage(): void {
  if (!hasUnreadMessage) return;
  hasUnreadMessage = false;
  notify();
}

/**
 * Note that the user has caught up through this agent message timestamp.
 * Call when opening Bestie surfaces or when seeding from history.
 */
export function markBestieAgentMessagesSeen(createdAtSeconds: number): void {
  if (createdAtSeconds > seenAgentCreatedAt) {
    seenAgentCreatedAt = createdAtSeconds;
  }
  if (hasUnreadMessage) {
    hasUnreadMessage = false;
    notify();
  }
}

export function getBestieSeenAgentCreatedAt(): number {
  return seenAgentCreatedAt;
}

/**
 * Ingest agent message timestamps. Sets unread when a newer agent message
 * arrives while Bestie surfaces are closed.
 */
export function ingestBestieAgentMessageCreatedAt(
  createdAtSeconds: number,
): void {
  if (createdAtSeconds <= seenAgentCreatedAt) return;
  if (isBestieSurfaceOpen()) {
    seenAgentCreatedAt = createdAtSeconds;
    if (hasUnreadMessage) {
      hasUnreadMessage = false;
      notify();
    }
    return;
  }
  seenAgentCreatedAt = createdAtSeconds;
  if (!hasUnreadMessage) {
    hasUnreadMessage = true;
    notify();
  }
}

export function useBestieHasUnreadMessage(): boolean {
  return React.useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getBestieHasUnreadMessage,
    () => false,
  );
}

/** Test helper. */
export function __resetBestieAttentionStoreForTests(): void {
  hasUnreadMessage = false;
  popoverOpen = false;
  viewingBestieDm = false;
  seenAgentCreatedAt = 0;
  notify();
}
