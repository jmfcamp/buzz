/**
 * "Assistant replies" notification class: a message from your assistant agent in a DM. People DMs keep following
 * "Direct messages"; reminders, approvals and assistant @mentions in channels follow their own switches.
 */
export function isAssistantReply(
  authorPubkey: string | null | undefined,
  channelType: string | null | undefined,
  assistantPubkey: string | null | undefined,
): boolean {
  if (channelType !== "dm" || !authorPubkey || !assistantPubkey) return false;
  return (
    authorPubkey.trim().toLowerCase() === assistantPubkey.trim().toLowerCase()
  );
}
