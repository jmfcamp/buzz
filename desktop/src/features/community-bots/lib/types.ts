export const MAX_COMMUNITY_BOT_NAME_LEN = 80;

export type CommunityBotSource = "openclaw";

export type CommunityBot = {
  id: string;
  name: string;
  pubkey: string;
  source: CommunityBotSource;
};

export type CommunityBotsPayload = {
  version: 1;
  bots: CommunityBot[];
};

export type CommunityBotsState =
  | "disconnected"
  | "pending"
  | "connected"
  | "insufficient_scopes";

export type CommunityBotsStatus = {
  state: CommunityBotsState;
  url: string | null;
  hasPassword: boolean;
  requestId: string | null;
  deviceId: string | null;
  requestedScopes: string[];
  approvedScopes: string[];
};

export const MISSING_PAIRING_REQUEST_ID = "not provided by gateway";

export function pairingRequestIdLabel(
  requestId: string | null | undefined,
): string {
  const trimmed = requestId?.trim() ?? "";
  return trimmed || MISSING_PAIRING_REQUEST_ID;
}

export type RemoteOpenClawAgent = {
  id: string;
  name: string;
  pubkey?: string | null;
};

/** OpenClaw `agent.name`, then `agent.id` (mo, captain, wayfinder). */
export function defaultRemoteAgentName(
  agent: Pick<RemoteOpenClawAgent, "id" | "name">,
): string {
  return agent.name?.trim() || agent.id;
}

export function normalizeCommunityBotDisplayName(
  value: string | undefined,
  fallback: string,
): string {
  const trimmed = value?.trim() ?? "";
  return trimmed || fallback.trim();
}

export type ResolvedBotIdentity = {
  pubkey: string;
  minted: boolean;
};

export const MISSING_BUZZ_ACCOUNT_COMMAND =
  "openclaw channels add --channel buzz --account";

export function missingBuzzAccountMessage(agentId: string): string {
  return `This OpenClaw agent has no Buzz account yet. On the VPS run: ${MISSING_BUZZ_ACCOUNT_COMMAND} ${agentId}`;
}

export function isMissingBuzzAccountError(error: unknown): boolean {
  const message = (
    error instanceof Error ? error.message : String(error)
  ).toLowerCase();
  return (
    message.includes("no buzz account") ||
    message.includes(MISSING_BUZZ_ACCOUNT_COMMAND)
  );
}

/** Shown when OpenClaw `config.get` withholds or redacts the Buzz nsec. */
export const VPS_SECRET_UNAVAILABLE =
  "Private key stays on the VPS; the gateway did not return it.";

export type RevealedBotSecret = {
  nsec: string | null;
  unavailableReason: string | null;
};

export function canViewCommunityBotSecret(input: {
  canManageCommunity: boolean;
  isInstalledBot: boolean;
}): boolean {
  return input.canManageCommunity && input.isInstalledBot;
}

/** Accept a confirmed 64-char hex pubkey only — never an nsec or npub. */
export function parseConfirmedPublicHex(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (trimmed.startsWith("nsec1") || trimmed.startsWith("npub1")) {
    return null;
  }
  if (/^[0-9a-f]{64}$/.test(trimmed)) {
    return trimmed;
  }
  return null;
}

export const REQUIRED_OPERATOR_SCOPES = [
  "operator.read",
  "operator.write",
  "operator.admin",
] as const;
