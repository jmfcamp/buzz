import * as React from "react";

import { useAppNavigation } from "@/app/navigation/useAppNavigation";
import { ViewLoadingFallback } from "@/shared/ui/ViewLoadingFallback";

const BotsView = React.lazy(async () => {
  const module = await import("@/features/community-bots/ui/BotsView");
  return { default: module.BotsView };
});

const BotDetailView = React.lazy(async () => {
  const module = await import("@/features/community-bots/ui/BotDetailView");
  return { default: module.BotDetailView };
});

type BotsScreenProps = {
  selectedBotId: string | null;
};

export function BotsScreen({ selectedBotId }: BotsScreenProps) {
  const { goBot, goBots, goChannel, goSettings } = useAppNavigation();

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <React.Suspense fallback={<ViewLoadingFallback kind="bots" />}>
        {selectedBotId ? (
          <BotDetailView
            botId={selectedBotId}
            onBack={() => void goBots({ replace: true })}
            onOpenChannel={(channelId) => void goChannel(channelId)}
          />
        ) : (
          <BotsView
            onOpenBot={(botId) => void goBot(botId)}
            onOpenBotsSettings={() => void goSettings("bots")}
          />
        )}
      </React.Suspense>
    </div>
  );
}
