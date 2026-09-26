import type {
  BrowserAgentGrant,
  BrowserAgentMode,
} from "@/features/browser-agent/lib/types";
import type { ConversationPinBinding } from "@/features/playground/lib/conversationPins";

export type BrowserConversationBinding = {
  key: string;
  source: "grant" | "pin";
  channelId: string;
  threadRoot: string | null;
  mode?: BrowserAgentMode;
};

function shortId(value: string, max = 10): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}…`;
}

/** Channel chip label: prefer display name, else truncated id. */
export function browserBindingChannelLabel(
  channelId: string,
  displayName?: string | null,
): string {
  const name = displayName?.trim();
  if (name) return shortId(name, 24);
  return shortId(channelId);
}

/** Thread chip label — short; title/id belongs in the tooltip. */
export function browserBindingThreadLabel(): string {
  return "Thread";
}

/**
 * Single chip label for a conversation binding.
 * Thread-bound: `{channel}: Thread`. Channel-only: channel name.
 */
export function browserBindingChipLabel(
  channelId: string,
  displayName: string | null | undefined,
  threadRoot: string | null | undefined,
): string {
  const channel = browserBindingChannelLabel(channelId, displayName);
  if (threadRoot?.trim()) {
    return `${channel}: ${browserBindingThreadLabel()}`;
  }
  return channel;
}

/** Tooltip detail for a binding chip (channel name + thread id when present). */
export function browserBindingChipTooltip(
  channelId: string,
  displayName: string | null | undefined,
  threadRoot: string | null | undefined,
): string {
  const channel = displayName?.trim() || channelId;
  const thread = threadRoot?.trim();
  if (thread) return `${channel} · thread ${thread}`;
  return channel;
}

/**
 * @deprecated Prefer chips without prose prefixes. Kept for any callers that
 * still want a source word; Browsers list no longer renders this.
 */
export function browserBindingSourceLabel(
  binding: Pick<BrowserConversationBinding, "source" | "mode">,
): string {
  if (binding.source === "pin") return "Pinned";
  if (binding.mode === "drive") return "Driving";
  return "Observing";
}

/**
 * Grant binding first, then pin bindings. Same channel+thread collapses to one
 * chip set (grant wins) so the row does not show duplicate navigation chips.
 */
export function buildBrowserConversationBindings(input: {
  grant: BrowserAgentGrant | null;
  pinBindings: readonly ConversationPinBinding[];
}): BrowserConversationBinding[] {
  const out: BrowserConversationBinding[] = [];
  const seen = new Set<string>();

  function push(binding: BrowserConversationBinding) {
    const dedupe = `${binding.channelId}:${binding.threadRoot ?? ""}`;
    if (seen.has(dedupe)) return;
    seen.add(dedupe);
    out.push(binding);
  }

  if (input.grant?.channelId) {
    const channelId = input.grant.channelId.trim();
    const threadRoot = input.grant.threadRoot?.trim() || null;
    push({
      key: `grant:${channelId}:${threadRoot ?? ""}`,
      source: "grant",
      channelId,
      threadRoot,
      mode: input.grant.mode,
    });
  }

  for (const pin of input.pinBindings) {
    const channelId = pin.channelId?.trim() || "";
    if (!channelId) continue;
    const threadRoot = pin.threadRoot?.trim() || null;
    push({
      key: `pin:${pin.scopeKey}`,
      source: "pin",
      channelId,
      threadRoot,
    });
  }

  return out;
}
