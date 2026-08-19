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
  requestedScopes: string[];
  approvedScopes: string[];
};

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
