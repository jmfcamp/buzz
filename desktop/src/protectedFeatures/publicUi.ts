import { createElement, type ReactNode } from "react";

import { stripAssistantTurnHints } from "@/features/assistant/listProtocol";
import { ChannelScreen } from "@/features/channels/ui/ChannelScreen";
import type { ChannelScreenProps } from "@/features/channels/ui/ChannelScreen.types";
import type { TimelineMessage } from "@/features/messages/types";
import type { Channel, ManagedAgent } from "@/shared/api/types";

export function ProtectedGlobalOverlay() {
  return null;
}

export function ProtectedMessageAction(_props: {
  channelId?: string | null;
  message: TimelineMessage;
}) {
  return null;
}

export function ProtectedMessageActionsBoundary({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}

export function ProtectedAgentBestieAction(_props: { agent: ManagedAgent }) {
  return null;
}

export function ProtectedBestieCardBadge(_props: {
  agent: ManagedAgent;
  isBestie: boolean;
}) {
  return null;
}

export function ProtectedBestieSidebarEntry() {
  return null;
}

export function ProtectedBestieProfileTrigger() {
  return null;
}

export function useProtectedBestiePubkey(
  _agents: ManagedAgent[],
): string | null {
  return null;
}

export function useProtectedVisibleDirectMessages(
  channels: Channel[],
  _currentPubkey: string | undefined,
) {
  return channels;
}

export function useProtectedBestieChannelExtras(
  _activeChannel: Channel | null | undefined,
) {
  return { contextColumn: null, contextColumnOpen: false };
}

export function ProtectedChannelScreen(props: ChannelScreenProps) {
  // DMs (the Assistant conversation): hide the Assistant's injected turn-hint context in the rendered body, as the
  // desktop's Assistant DM does. Display only; the event content the agent got is untouched.
  if (
    props.activeChannel?.channelType === "dm" &&
    !props.transformDisplayedMessageBody
  ) {
    return createElement(ChannelScreen, {
      ...props,
      transformDisplayedMessageBody: stripAssistantTurnHints,
    });
  }
  return createElement(ChannelScreen, props);
}

export function ProtectedOpenClawWorkspaceSettingsCard() {
  return null;
}

/** OSS / upstream: ignore Hula capability frames. */
export async function handleProtectedRelayPayload(
  _payload: unknown,
): Promise<boolean> {
  return false;
}
