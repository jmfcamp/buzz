import { canonicalRelayUrl } from "@/features/agents/managedAgentRuntimeStatus";

export const BESTIE_AUTONOMOUS_CHANNEL_STORAGE_PREFIX =
  "buzz-bestie-autonomous-channel.v1";

export type BestieAutonomousChannelScope = {
  agentPubkey: string;
  ownerPubkey: string;
  relayUrl: string;
};

export function bestieAutonomousChannelStorageKey(
  scope: BestieAutonomousChannelScope,
): string {
  const relay =
    canonicalRelayUrl(scope.relayUrl) ?? scope.relayUrl.trim().toLowerCase();
  return [
    BESTIE_AUTONOMOUS_CHANNEL_STORAGE_PREFIX,
    relay,
    scope.ownerPubkey.toLowerCase(),
    scope.agentPubkey.toLowerCase(),
  ].join(":");
}

export function parseBestieAutonomousChannelId(
  value: unknown,
): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function readBestieAutonomousChannelId(
  scope: BestieAutonomousChannelScope,
): string | null {
  try {
    const raw = window.localStorage.getItem(
      bestieAutonomousChannelStorageKey(scope),
    );
    if (!raw) return null;
    // Accept bare id string or JSON `{ "channelId": "..." }`.
    if (raw.startsWith("{")) {
      const parsed = JSON.parse(raw) as unknown;
      if (typeof parsed === "object" && parsed !== null) {
        return parseBestieAutonomousChannelId(
          (parsed as { channelId?: unknown }).channelId,
        );
      }
      return null;
    }
    return parseBestieAutonomousChannelId(raw);
  } catch {
    return null;
  }
}

export function writeBestieAutonomousChannelId(
  scope: BestieAutonomousChannelScope,
  channelId: string,
): void {
  const id = parseBestieAutonomousChannelId(channelId);
  if (!id) return;
  try {
    window.localStorage.setItem(
      bestieAutonomousChannelStorageKey(scope),
      JSON.stringify({ channelId: id }),
    );
  } catch {
    // Ignore quota / private-mode failures.
  }
}

export function clearBestieAutonomousChannelId(
  scope: BestieAutonomousChannelScope,
): void {
  try {
    window.localStorage.removeItem(bestieAutonomousChannelStorageKey(scope));
  } catch {
    // Ignore storage failures.
  }
}
