// Web Assistant popup: which of the Assistant's messages shown there count as read.
/** Which of the Assistant's shown messages to mark read, skipping ones already marked this session. */
export function planAssistantSeenReads(
  events: readonly { id: string; pubkey?: string; created_at: number; tags?: string[][] }[],
  agentPubkey: string,
  already: ReadonlySet<string>,
): {
  ids: string[];
  replies: { id: string; createdAt: number; rootId: string | null }[];
  topLevelAt: number | null;
} {
  const agent = agentPubkey.toLowerCase();
  const ids: string[] = [];
  const replies: { id: string; createdAt: number; rootId: string | null }[] = [];
  let topLevelAt: number | null = null;
  for (const e of events) {
    if (!e?.id || already.has(e.id)) continue;
    if ((e.pubkey ?? "").toLowerCase() !== agent) continue;
    ids.push(e.id);
    const eTags = (e.tags ?? []).filter((t) => t[0] === "e" && t[1]);
    if (eTags.length) {
      const root = eTags.find((t) => t[3] === "root") ?? eTags[0];
      replies.push({ id: e.id, createdAt: e.created_at, rootId: root?.[1] ?? null });
    } else {
      topLevelAt = Math.max(topLevelAt ?? 0, e.created_at);
    }
  }
  return { ids, replies, topLevelAt };
}
