/**
 * Project Channels lists show only channels the viewer can actually open:
 * archived, deleted, or unresolvable related channels (e.g. stale ids left in
 * a project record) render nothing instead of "Channel unavailable". While
 * the channel list is still loading, rows stay so the list does not jump.
 */
export function isRenderableProjectChannel(
  channel: { archivedAt?: string | null } | undefined,
  channelsLoading = false,
): boolean {
  if (!channel) return channelsLoading;
  return !channel.archivedAt;
}
