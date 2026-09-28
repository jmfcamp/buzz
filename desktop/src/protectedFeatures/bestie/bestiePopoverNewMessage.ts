/**
 * Assistant popover — detect a new message the user is not currently looking at.
 */

export type BestiePopoverNewMessageTarget = {
  /** Message / root id to jump to. */
  id: string;
  /** True when the message is outside the active session filter. */
  outsideSession: boolean;
};

/**
 * Pick the newest message the popover should offer a jump target for.
 *
 * - Prefer the newest channel message that is *outside* the active session
 *   (another top-level thread / response the filter hides).
 * - Otherwise, when the user has scrolled away from the bottom, the newest
 *   in-session message is the jump target ("New message" → scroll to it).
 */
export function resolveBestiePopoverNewMessageTarget(input: {
  /** Newest-first or any order; we pick by createdAt then id. */
  allMessages: readonly { id: string; createdAt: number; parentId?: string | null }[];
  sessionMessageIds: ReadonlySet<string>;
  sessionRootId: string | null | undefined;
  /** User is scrolled near the transcript bottom. */
  nearBottom: boolean;
  /** Ignore the user's own outbound id so sending doesn't flash the banner. */
  ignoreMessageId?: string | null;
}): BestiePopoverNewMessageTarget | null {
  const ignore = input.ignoreMessageId?.trim() || null;
  const sorted = [...input.allMessages].sort((a, b) => {
    if (a.createdAt !== b.createdAt) return b.createdAt - a.createdAt;
    return b.id.localeCompare(a.id);
  });

  for (const message of sorted) {
    if (ignore && message.id === ignore) continue;
    if (!input.sessionMessageIds.has(message.id)) {
      // Outside the active session — always offer jump (even if near bottom
      // of the *other* transcript, since this thread isn't shown).
      return { id: message.id, outsideSession: true };
    }
  }

  if (input.nearBottom) return null;
  const newestInSession = sorted.find((message) =>
    input.sessionMessageIds.has(message.id),
  );
  if (!newestInSession) return null;
  if (ignore && newestInSession.id === ignore) return null;
  return { id: newestInSession.id, outsideSession: false };
}
