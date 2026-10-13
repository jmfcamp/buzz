import * as React from "react";

import { useAppNavigation } from "@/app/navigation/useAppNavigation";
import {
  BOTS_DIRECTORY_SEARCH_KEY,
  botsDirectorySelectedBotId,
} from "@/features/community-bots/lib/directory";
import { useHistorySearchState } from "@/shared/hooks/useHistorySearchState";
import { useThreadPanelWidth } from "@/shared/hooks/useThreadPanelWidth";
import { usePhoneLayout } from "@/shared/lib/phoneLayout";
import { ViewLoadingFallback } from "@/shared/ui/ViewLoadingFallback";

const BotsView = React.lazy(async () => {
  const module = await import("@/features/community-bots/ui/BotsView");
  return { default: module.BotsView };
});

const BotDetailPanel = React.lazy(async () => {
  const module = await import("@/features/community-bots/ui/BotDetailPanel");
  return { default: module.BotDetailPanel };
});

const BOTS_DIRECTORY_SEARCH_KEYS = [BOTS_DIRECTORY_SEARCH_KEY] as const;

export function BotsScreen() {
  const { applyPatch, values } = useHistorySearchState(
    BOTS_DIRECTORY_SEARCH_KEYS,
  );
  const selectedBotId = botsDirectorySelectedBotId(values.bot);
  const threadPanelWidth = useThreadPanelWidth();
  const { goChannel, goSettings } = useAppNavigation();
  // Phone: an open bot profile is its own full-screen page (no squeezed side panel next to the list).
  const phoneDetail = usePhoneLayout() && Boolean(selectedBotId);

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className={`flex min-h-0 min-w-0 flex-1 flex-row overflow-hidden${phoneDetail ? " phone-detail-full" : ""}`}>
        {phoneDetail ? null : (
          <React.Suspense fallback={<ViewLoadingFallback kind="bots" />}>
            <BotsView
              onOpenBot={(botId) => applyPatch({ bot: botId })}
              onOpenBotsSettings={() => void goSettings("bots")}
            />
          </React.Suspense>
        )}
        {selectedBotId ? (
          <React.Suspense fallback={null}>
            <BotDetailPanel
              botId={selectedBotId}
              canResetWidth={threadPanelWidth.canReset}
              onClose={() => applyPatch({ bot: null })}
              onOpenChannel={(channelId) => void goChannel(channelId)}
              onResetWidth={threadPanelWidth.onResetWidth}
              onResizeStart={threadPanelWidth.onResizeStart}
              widthPx={threadPanelWidth.widthPx}
            />
          </React.Suspense>
        ) : null}
      </div>
    </div>
  );
}
