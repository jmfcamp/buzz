import { isMeaningfulItem } from "@/features/agents/ui/agentSessionTranscriptPresentation";
import type { TranscriptItem } from "@/features/agents/ui/agentSessionTypes";

/**
 * Activity rows suitable for the Bestie popover when "Show activity" is on.
 * Drops chat-message items (Bestie already renders DM bubbles), raw/suppressed
 * noise, and items outside the active Bestie DM channel.
 */
export function filterBestieActivityItems(
  items: readonly TranscriptItem[],
  options: {
    channelId: string | null | undefined;
  },
): TranscriptItem[] {
  const channelId = options.channelId ?? null;
  return items.filter((item) => {
    if (item.type === "message") return false;
    if (!isMeaningfulItem(item)) return false;
    if (item.renderClass === "raw-rail" || item.renderClass === "suppressed") {
      return false;
    }
    if (channelId && item.channelId && item.channelId !== channelId) {
      return false;
    }
    return true;
  });
}
