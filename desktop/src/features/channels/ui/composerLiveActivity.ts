import {
  getActivityHeadline,
  isMeaningfulItem,
  isSpineItem,
} from "@/features/agents/ui/agentSessionTranscriptPresentation";
import type { TranscriptItem } from "@/features/agents/ui/agentSessionTypes";

/**
 * Lifecycle meta-frames that must never headline the status. They pass the
 * spine filter (meaningful lifecycle items) but would surface as bare
 * "Usage" / "Commands" labels that read like phantom activity.
 */
const STATUS_HEADLINE_EXCLUDED_SOURCES = new Set([
  "usage_update",
  "available_commands_update",
]);

export type ActivityPillHeadline = {
  id: string;
  label: string;
};

export type ActivityPillPresentation = {
  id: string;
  label: string;
};

/**
 * Choose the label shown for an agent's composer activity status.
 *
 * Observer activity is authoritative while a turn is active, even though the
 * ACP harness continues refreshing its public typing signal throughout that
 * turn. Raw typing remains a fallback before observer telemetry arrives and
 * after the observer turn completes.
 */
export function deriveActivityPillPresentation({
  agentName,
  headline,
  isTyping,
  workingSource,
}: {
  agentName: string;
  headline: ActivityPillHeadline | null;
  isTyping: boolean;
  workingSource: "observer" | "typing" | "none";
}): ActivityPillPresentation {
  if (workingSource === "observer") {
    return (
      headline ?? {
        id: "generic-working",
        label: `${agentName} is working…`,
      }
    );
  }

  if (isTyping) {
    return {
      id: "typing-override",
      label: `${agentName} is typing…`,
    };
  }

  return (
    headline ?? {
      id: "generic-working",
      label: `${agentName} is working…`,
    }
  );
}

/**
 * Latest action headline for a working agent's composer status.
 *
 * Tool items headline in the terse action format from getActivityHeadline —
 * verb + compact object ("Read foo.ts"). Channel-scoped, two-tier scan
 * (spine items headline over metadata reads), newest wins.
 */
export function deriveActivityPillLabel({
  activeTurnIds,
  channelId,
  transcript,
}: {
  activeTurnIds?: ReadonlySet<string>;
  channelId: string | null;
  transcript: readonly TranscriptItem[];
}): ActivityPillHeadline | null {
  const scoped = transcript.filter(
    (item) =>
      (!channelId || item.channelId === channelId) &&
      (!activeTurnIds ||
        (item.turnId !== null &&
          item.turnId !== undefined &&
          activeTurnIds.has(item.turnId))),
  );
  const passFilter = scoped.some(isSpineItem) ? isSpineItem : isMeaningfulItem;

  for (let index = scoped.length - 1; index >= 0; index -= 1) {
    const item = scoped[index];
    if (!item || !passFilter(item)) {
      continue;
    }
    if (
      item.type === "lifecycle" &&
      item.acpSource !== undefined &&
      STATUS_HEADLINE_EXCLUDED_SOURCES.has(item.acpSource)
    ) {
      continue;
    }
    const headline = getActivityHeadline(item);
    if (!headline) {
      continue;
    }
    return { id: item.id, label: headline };
  }

  return null;
}
