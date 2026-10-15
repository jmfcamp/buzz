import * as React from "react";

import { TopbarSearch } from "@/features/search/ui/TopbarSearch";
import type { Channel, SearchHit } from "@/shared/api/types";
import { useOptionalSidebar } from "@/shared/ui/sidebar";

// Re-exported so AppShell takes both search entry points from one import.
export { TopbarSearch };

/** Edge-gated counter: bumps only when `request` changes while `active` is true, so a request made while the
 *  sidebar sheet is open (its own search handles it) is never replayed here later. */
export function gateRequest(
  prev: { seen: number; out: number },
  request: number,
  active: boolean,
): { seen: number; out: number } {
  if (request === prev.seen) return prev;
  return { seen: request, out: active ? prev.out + 1 : prev.out };
}

function useGatedRequest(request: number, active: boolean): number {
  const ref = React.useRef({ seen: request, out: 0 });
  ref.current = gateRequest(ref.current, request, active);
  return ref.current.out;
}

type SheetModeSearchProps = {
  channelId?: string | null;
  channels: Channel[];
  currentPubkey?: string;
  goChannel: (channelId: string) => unknown;
  onBrowseChannels?: () => void;
  onCreateAgent: () => void;
  onCreateChannel: () => void;
  onOpenResult: (hit: SearchHit, query: string) => void;
  openDm: (input: { pubkeys: string[] }) => Promise<{ id: string }>;
  /** [search everything, search in current channel] focus counters from AppShell. */
  requests: readonly [number, number];
};

/**
 * Narrow iPad / small window (< 768px): the left panel is a Radix sheet whose content (and its "Search everything"
 * TopbarSearch) is unmounted while the sheet is closed. The top-chrome Search icon only bumps a focus counter, so with
 * the panel closed nobody heard it and search never opened. This always-mounted instance (trigger hidden; the dialog
 * is portalled) opens search for requests made while the sheet is closed. Wide layouts keep the sidebar mounted
 * (offcanvas), so this renders nothing there.
 */
export function SheetModeSearch({
  requests: [searchFocusRequest, scopeSearchFocusRequest],
  goChannel,
  openDm,
  ...props
}: SheetModeSearchProps) {
  const sidebar = useOptionalSidebar();
  const active = Boolean(sidebar?.isMobile && !sidebar.openMobile);
  const focusRequest = useGatedRequest(searchFocusRequest, active);
  const scopeFocusRequest = useGatedRequest(scopeSearchFocusRequest, active);
  if (!sidebar?.isMobile) return null;
  return (
    <TopbarSearch
      channels={props.channels}
      className="hidden"
      currentChannelId={props.channelId}
      currentPubkey={props.currentPubkey}
      focusRequest={focusRequest}
      onBrowseChannels={props.onBrowseChannels}
      onCreateAgent={props.onCreateAgent}
      onCreateChannel={() => {
        // The create-channel dialog lives in the sidebar; mount it by opening the sheet.
        sidebar.setOpenMobile(true);
        props.onCreateChannel();
      }}
      onOpenChannel={(channelId) => void goChannel(channelId)}
      onOpenResult={props.onOpenResult}
      onOpenUser={async (user) => {
        const dm = await openDm({ pubkeys: [user.pubkey] });
        await goChannel(dm.id);
      }}
      scopeFocusRequest={scopeFocusRequest}
      suggestionChannels={props.channels}
    />
  );
}
