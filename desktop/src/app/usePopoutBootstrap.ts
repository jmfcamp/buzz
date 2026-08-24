import * as React from "react";

import { useAppNavigation } from "@/app/navigation/useAppNavigation";
import {
  currentPopoutPayload,
  type PopoutPayload,
} from "@/features/popout/lib/popoutWindow";

export function usePopoutBootstrap(): PopoutPayload | null {
  const payload = React.useMemo(() => currentPopoutPayload(), []);
  const { goChannel } = useAppNavigation();

  React.useEffect(() => {
    if (!payload || payload.kind === "playground") return;
    if (!payload.channelId) return;
    void goChannel(payload.channelId, {
      replace: true,
      ...(payload.threadId ? { thread: payload.threadId } : {}),
    });
  }, [goChannel, payload]);

  return payload;
}
