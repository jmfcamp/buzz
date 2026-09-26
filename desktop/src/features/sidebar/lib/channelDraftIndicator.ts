import {
  getActiveDraftEntries,
  type DraftState,
} from "@/features/messages/lib/useDrafts";
import { getThreadRootId } from "@/features/messages/ui/DraftsPanel";

function draftHasVisibleContent(draft: DraftState): boolean {
  return draft.content.trim().length > 0 || draft.pendingImeta.length > 0;
}

/**
 * True when the user is currently on the composer surface that owns this draft
 * (channel main composer, or the matching thread composer).
 */
export function isViewingDraftSurface(
  draftKey: string,
  input: {
    channelId: string;
    selectedChannelId: string | null;
    selectedThreadId: string | null;
  },
): boolean {
  if (input.selectedChannelId !== input.channelId) return false;
  const threadRoot = getThreadRootId(draftKey);
  if (threadRoot) {
    return input.selectedThreadId === threadRoot;
  }
  // Channel-level draft: viewing when no thread is open.
  return !input.selectedThreadId;
}

/**
 * Slack-style pencil: channel (or any of its threads) has an active draft, and
 * the user is not currently viewing that draft's composer surface.
 */
export function channelShowsDraftIndicator(
  channelId: string,
  input: {
    selectedChannelId: string | null;
    selectedThreadId: string | null;
  },
): boolean {
  const drafts = getActiveDraftEntries().filter(
    (entry) =>
      entry.draft.channelId === channelId &&
      entry.draft.status === "active" &&
      draftHasVisibleContent(entry.draft),
  );
  if (drafts.length === 0) return false;
  return drafts.some(
    (entry) =>
      !isViewingDraftSurface(entry.key, {
        channelId,
        selectedChannelId: input.selectedChannelId,
        selectedThreadId: input.selectedThreadId,
      }),
  );
}

/**
 * Slack-style pencil for a thread list/summary row: that thread has an active
 * draft and the user is not currently viewing its composer.
 */
export function threadShowsDraftIndicator(
  threadRootId: string,
  input: {
    channelId: string | null | undefined;
    selectedChannelId: string | null;
    selectedThreadId: string | null;
  },
): boolean {
  if (!threadRootId) return false;
  const drafts = getActiveDraftEntries().filter((entry) => {
    if (entry.draft.status !== "active" || !draftHasVisibleContent(entry.draft)) {
      return false;
    }
    if (getThreadRootId(entry.key) !== threadRootId) return false;
    if (input.channelId && entry.draft.channelId !== input.channelId) {
      return false;
    }
    return true;
  });
  if (drafts.length === 0) return false;
  const channelId = input.channelId ?? drafts[0]?.draft.channelId;
  if (!channelId) return false;
  return drafts.some(
    (entry) =>
      !isViewingDraftSurface(entry.key, {
        channelId,
        selectedChannelId: input.selectedChannelId,
        selectedThreadId: input.selectedThreadId,
      }),
  );
}
