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

export type ResolvedBotIdentity = {
  pubkey: string;
  minted: boolean;
};

export const REQUIRED_OPERATOR_SCOPES = [
  "operator.read",
  "operator.write",
  "operator.admin",
] as const;
