import type { RelayEvent } from "@/shared/api/types";
import { KIND_COMMUNITY_BOTS } from "@/shared/constants/kinds";

export const DEFAULT_COMMUNITY_BOT_SCOPES = [
  "operator.read",
  "operator.write",
  "operator.admin",
];

export const DEFAULT_COMMUNITY_BOT_REQUEST_ID = "pairing-req-42";

export type MockRemoteCommunityBot = {
  id: string;
  name: string;
  pubkey?: string | null;
};

export type MockCommunityBotsOptions = {
  remoteAgents?: MockRemoteCommunityBot[];
  startConnected?: boolean;
  startPending?: boolean;
  connectResult?: "pending" | "connected" | "insufficient_scopes";
};

export type CommunityBotsStatus = {
  state: "disconnected" | "pending" | "connected" | "insufficient_scopes";
  url: string | null;
  hasPassword: boolean;
  requestId: string | null;
  requestedScopes: string[];
  approvedScopes: string[];
};

const DEFAULT_REMOTE_AGENTS: MockRemoteCommunityBot[] = [
  { id: "main", name: "Main", pubkey: "11".repeat(32) },
  { id: "mo", name: "Mo", pubkey: "22".repeat(32) },
  { id: "captain", name: "Captain", pubkey: "33".repeat(32) },
];

export function createCommunityBotsMock(options?: MockCommunityBotsOptions) {
  const remoteAgents = options?.remoteAgents ?? DEFAULT_REMOTE_AGENTS;
  let url: string | null = options?.startConnected
    ? "wss://stitch.example.com"
    : null;
  let hasPassword =
    options?.startConnected === true || options?.startPending === true;
  let approved = options?.startConnected === true;
  let state: CommunityBotsStatus["state"] = options?.startConnected
    ? "connected"
    : options?.startPending
      ? "pending"
      : "disconnected";
  let requestId = state === "pending" ? DEFAULT_COMMUNITY_BOT_REQUEST_ID : null;
  const catalogEvents: RelayEvent[] = [];

  function status(): CommunityBotsStatus {
    return {
      state,
      url,
      hasPassword,
      requestId,
      requestedScopes: DEFAULT_COMMUNITY_BOT_SCOPES,
      approvedScopes: approved ? [...DEFAULT_COMMUNITY_BOT_SCOPES] : [],
    };
  }

  function approve() {
    approved = true;
  }

  function handleCommand(
    command: string,
    payload: Record<string, unknown> = {},
  ) {
    switch (command) {
      case "community_bots_get_status":
        return status();
      case "community_bots_connect": {
        url = typeof payload.url === "string" ? payload.url : url;
        hasPassword =
          hasPassword ||
          (typeof payload.password === "string" && payload.password.length > 0);
        if (!approved) {
          state = "pending";
          requestId = DEFAULT_COMMUNITY_BOT_REQUEST_ID;
          if (options?.connectResult === "insufficient_scopes") {
            state = "insufficient_scopes";
            requestId = null;
          }
          return status();
        }
        state = "connected";
        requestId = null;
        return status();
      }
      case "community_bots_disconnect":
        url = null;
        hasPassword = false;
        approved = false;
        state = "disconnected";
        requestId = null;
        return status();
      case "community_bots_list_remote_agents":
        if (state !== "connected") {
          throw new Error("no OpenClaw gateway is connected");
        }
        return remoteAgents;
      case "community_bots_resolve_identity": {
        const agentId = String(payload.agentId ?? "");
        const provided =
          typeof payload.pubkey === "string" ? payload.pubkey : null;
        const match = remoteAgents.find((agent) => agent.id === agentId);
        return {
          pubkey: provided || match?.pubkey || "aa".repeat(32),
          minted: !provided && !match?.pubkey,
        };
      }
      default:
        return undefined;
    }
  }

  return {
    catalogEvents,
    handleCommand,
    approve,
    isCatalogKind(kind: number) {
      return kind === KIND_COMMUNITY_BOTS;
    },
    upsertCatalog(event: RelayEvent) {
      const dTag = event.tags.find((tag) => tag[0] === "d")?.[1];
      if (dTag) {
        const idx = catalogEvents.findIndex(
          (existing) =>
            existing.pubkey.toLowerCase() === event.pubkey.toLowerCase() &&
            existing.tags.some((tag) => tag[0] === "d" && tag[1] === dTag),
        );
        if (idx >= 0) catalogEvents.splice(idx, 1);
      }
      catalogEvents.push(event);
    },
  };
}

export type CommunityBotsMock = ReturnType<typeof createCommunityBotsMock>;
