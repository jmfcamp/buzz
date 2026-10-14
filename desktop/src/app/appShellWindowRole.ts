import * as React from "react";

import type { Channel } from "@/shared/api/types";

/**
 * Every popout/companion window boots the full AppShell. Only the main window
 * may own OS notifications, or each open window fires its own copy.
 */
export function ownsDesktopNotificationsFor(
  isHuddleRoom: boolean,
  popout: unknown,
): boolean {
  return !isHuddleRoom && popout == null;
}

/** Ids of the DM channels in the current channel list. */
export function useDmChannelIds(channels: readonly Channel[] | undefined) {
  return React.useMemo(() => {
    const ids = new Set<string>();
    for (const channel of channels ?? []) {
      if (channel.channelType === "dm") ids.add(channel.id);
    }
    return ids;
  }, [channels]);
}
