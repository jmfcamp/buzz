import type * as React from "react";

import { BotDetailView } from "@/features/community-bots/ui/BotDetailView";
import { useEscapeKey } from "@/shared/hooks/useEscapeKey";
import {
  AuxiliaryPanel,
  AuxiliaryPanelBody,
  AuxiliaryPanelHeader,
  AuxiliaryPanelHeaderActions,
  AuxiliaryPanelHeaderGroup,
  AuxiliaryPanelHeaderTitleBlock,
} from "@/shared/layout/AuxiliaryPanel";

type BotDetailPanelProps = {
  botId: string;
  canResetWidth?: boolean;
  onClose: () => void;
  onOpenChannel: (channelId: string) => void;
  onResetWidth?: () => void;
  onResizeStart?: React.PointerEventHandler<HTMLButtonElement>;
  widthPx: number;
};

export function BotDetailPanel({
  botId,
  canResetWidth,
  onClose,
  onOpenChannel,
  onResetWidth,
  onResizeStart,
  widthPx,
}: BotDetailPanelProps) {
  useEscapeKey(onClose);

  return (
    <AuxiliaryPanel
      canResetWidth={canResetWidth}
      onClose={onClose}
      onResetWidth={onResetWidth}
      onResizeStart={onResizeStart}
      resizeHandleAriaLabel="Resize bot profile panel"
      resizeHandleTestId="bot-detail-resize-handle"
      testId="bot-detail-panel"
      widthPx={widthPx}
      header={
        <AuxiliaryPanelHeader data-testid="bot-detail-panel-header">
          <AuxiliaryPanelHeaderGroup>
            <AuxiliaryPanelHeaderTitleBlock title="Profile" />
          </AuxiliaryPanelHeaderGroup>
          <AuxiliaryPanelHeaderActions />
        </AuxiliaryPanelHeader>
      }
    >
      <AuxiliaryPanelBody
        className="overflow-y-auto px-4 pb-6"
        data-testid="bot-detail-scroll-body"
      >
        <BotDetailView botId={botId} onOpenChannel={onOpenChannel} />
      </AuxiliaryPanelBody>
    </AuxiliaryPanel>
  );
}
