import * as React from "react";

import {
  bestieIntroCountsTotal,
  formatBestieListIntroBanner,
  type BestieIntroCounts,
} from "./bestieListIntroNotice";

/**
 * Footer-avatar attention for Bestie DM replies.
 * Distinct from wake-nudge (`!` badge): this is a pulsing light ring for new
 * agent messages while the popover and Bestie DM thread are both closed.
 *
 * Pulse only for real unread outside Bestie surfaces. Stale flags left over
 * from history hydration or system-noise turns must not glow once the user
 * is caught up, and never while a Bestie surface is open.
 */

type Listener = () => void;

const listeners = new Set<Listener>();

let hasUnreadMessage = false;
let popoverOpen = false;
let viewingBestieDm = false;
/** Highest agent message created_at already acknowledged (unix seconds). */
let seenAgentCreatedAt = 0;
/**
 * List rows introduced by agent turns that lit the footer with no chat prose.
 * Cleared when a real message arrives, the user dismisses, or the popover closes.
 */
let listIntroCounts: BestieIntroCounts | null = null;
/** A real chat message is in this unread set — do not show the list banner. */
let attentionHasRealMessage = false;
let listIntroEpoch = 0;
let listIntroClearTimer: ReturnType<typeof setTimeout> | null = null;

function cancelListIntroClearTimer(): void {
  listIntroEpoch += 1;
  if (listIntroClearTimer == null) return;
  clearTimeout(listIntroClearTimer);
  listIntroClearTimer = null;
}

/**
 * Clear list-intro copy after the popover actually stays closed.
 * Deferred so React StrictMode's open/close/open bounce does not drop it.
 */
function scheduleListIntroClear(): void {
  cancelListIntroClearTimer();
  const epoch = listIntroEpoch;
  listIntroClearTimer = setTimeout(() => {
    if (epoch !== listIntroEpoch) return;
    listIntroClearTimer = null;
    if (!popoverOpen) clearBestieListIntroNotice();
  }, 0);
}

function notify() {
  for (const listener of listeners) listener();
}

/**
 * True only when there is real unread AND no Bestie surface is open.
 * Opening the popover / DM must never keep the footer ring glowing.
 */
export function getBestieHasUnreadMessage(): boolean {
  return hasUnreadMessage && !popoverOpen && !viewingBestieDm;
}

export function isBestieSurfaceOpen(): boolean {
  return popoverOpen || viewingBestieDm;
}

export function setBestiePopoverOpen(open: boolean): void {
  if (popoverOpen === open) return;
  popoverOpen = open;
  if (open) {
    cancelListIntroClearTimer();
    clearBestieUnreadMessage();
  } else {
    scheduleListIntroClear();
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
 * Advance the seen watermark without setting (or clearing) unread.
 * Used for hydration and system-noise agent turns that must not pulse.
 */
export function noteBestieAgentMessageCreatedAt(
  createdAtSeconds: number,
): void {
  if (createdAtSeconds > seenAgentCreatedAt) {
    seenAgentCreatedAt = createdAtSeconds;
  }
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
 * Record list rows that lit the footer without a real chat message.
 * No-op while a Bestie surface is open (the button did not light) or after a
 * real message already claimed this unread set.
 */
export function noteBestieListOnlyAttention(counts: BestieIntroCounts): void {
  if (isBestieSurfaceOpen() || attentionHasRealMessage) return;
  if (bestieIntroCountsTotal(counts) <= 0) return;
  if (!listIntroCounts) {
    listIntroCounts = {
      job: 0,
      reminder: 0,
      scratch: 0,
      thread: 0,
      todo: 0,
    };
  }
  listIntroCounts.reminder += counts.reminder;
  listIntroCounts.todo += counts.todo;
  listIntroCounts.thread += counts.thread;
  listIntroCounts.scratch += counts.scratch;
  listIntroCounts.job += counts.job;
  notify();
}

/** A real chat message lit the footer. Drop any list-only banner. */
export function noteBestieRealMessageAttention(): void {
  attentionHasRealMessage = true;
  if (!listIntroCounts) return;
  listIntroCounts = null;
  notify();
}

export function clearBestieListIntroNotice(): void {
  cancelListIntroClearTimer();
  attentionHasRealMessage = false;
  if (!listIntroCounts) return;
  listIntroCounts = null;
  notify();
}

/** Banner sentence for the open Assistant, or null when this is not list-only. */
export function getBestieListIntroBannerText(): string | null {
  if (attentionHasRealMessage || !listIntroCounts) return null;
  return formatBestieListIntroBanner(listIntroCounts);
}

export function useBestieListIntroBannerText(): string | null {
  return React.useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getBestieListIntroBannerText,
    () => null,
  );
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
  cancelListIntroClearTimer();
  hasUnreadMessage = false;
  popoverOpen = false;
  viewingBestieDm = false;
  seenAgentCreatedAt = 0;
  listIntroCounts = null;
  attentionHasRealMessage = false;
  notify();
}
