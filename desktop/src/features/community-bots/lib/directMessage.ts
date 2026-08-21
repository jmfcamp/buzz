/**
 * Community bots are Slack-style DM peers: any member can open a thread
 * with the last-mile pubkey. Managed and relay agents stay owner-gated.
 */
export function canDirectMessageIdentity(input: {
  isBot: boolean;
  isCommunityBot: boolean;
  viewerIsOwner: boolean;
}): boolean {
  if (input.isCommunityBot) return true;
  if (!input.isBot) return true;
  return input.viewerIsOwner;
}
