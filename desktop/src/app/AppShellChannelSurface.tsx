import type * as React from "react";
import * as BuzzTheme from "@/app/BuzzThemeSurfaces";
import { HuddleRoomHeader, HuddleStartingView } from "@/features/huddle";
import { PlaygroundHost } from "@/features/playground/ui/PlaygroundHost";
import { currentPopoutPayload } from "@/features/popout/lib/popoutWindow";
import { MainInsetProvider } from "@/shared/layout/MainInsetContext";
import { chromeCssVarDefaults } from "@/shared/layout/chromeLayout";
import { cn } from "@/shared/lib/cn";
import { SidebarInset, useSidebar } from "@/shared/ui/sidebar";

type AppShellChannelSurfaceProps = {
  children: React.ReactNode;
  hasCommunityRail: boolean;
  isHuddleRoom: boolean;
  isHuddleRoomStarting: boolean;
  mainInsetRef: React.RefObject<HTMLElement | null>;
  terminal?: React.ReactNode;
};

export function AppShellChannelSurface({
  children,
  hasCommunityRail,
  isHuddleRoom,
  isHuddleRoomStarting,
  mainInsetRef,
  terminal,
}: AppShellChannelSurfaceProps) {
  const { isMobile, openMobile, state: sidebarState } = useSidebar();
  const popout = currentPopoutPayload();
  const isSplitPopout = popout?.kind === "split";
  const contentUnframed = isHuddleRoom || popout != null;
  const hasCollapsedSidebarGutter =
    !isHuddleRoom &&
    !hasCommunityRail &&
    (isMobile ? !openMobile : sidebarState === "collapsed");

  return (
    <MainInsetProvider mainInsetRef={mainInsetRef}>
      <SidebarInset
        ref={mainInsetRef}
        className={cn(
          "relative isolate z-0 min-h-0 min-w-0 overflow-hidden",
          isSplitPopout && "flex flex-row",
          isHuddleRoom ? "bg-background" : "bg-sidebar",
          hasCollapsedSidebarGutter && "pl-2",
        )}
        data-buzz-content-surface={isHuddleRoom ? true : undefined}
        data-buzz-content-unframed={contentUnframed ? true : undefined}
        data-buzz-glass-inset
        data-buzz-shadow-viewport
        style={chromeCssVarDefaults as React.CSSProperties}
      >
        {hasCollapsedSidebarGutter ? (
          <div
            className="absolute inset-y-0 left-0 w-2 bg-sidebar"
            data-collapsed-content-gutter
          />
        ) : null}
        {isHuddleRoom && !isHuddleRoomStarting ? <HuddleRoomHeader /> : null}
        {isSplitPopout ? <PlaygroundHost /> : null}
        <BuzzTheme.ContentSurface
          className={isSplitPopout ? "min-w-0" : undefined}
          terminal={terminal}
          unframed={contentUnframed}
        >
          {isHuddleRoomStarting ? <HuddleStartingView /> : children}
        </BuzzTheme.ContentSurface>
        {isSplitPopout ? null : <PlaygroundHost />}
      </SidebarInset>
    </MainInsetProvider>
  );
}
