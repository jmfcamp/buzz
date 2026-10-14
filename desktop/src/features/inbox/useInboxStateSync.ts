import * as React from "react";

import { usePersonalPinsSync } from "@/features/pinned-sites/hooks";
import { currentPopoutPayload } from "@/features/popout/lib/popoutWindow";

import { startInboxStateSync } from "./inboxStateSync";

/**
 * Mount once per main window (AppShell remounts per community, so this
 * re-bootstraps against each community relay). Popout windows never sync.
 */
export function useInboxStateSync(
  pubkey: string | undefined,
  enabled: boolean,
) {
  const isPopout = React.useMemo(() => currentPopoutPayload() != null, []);
  // Personal pinned sites ride the same main-window, per-community lifecycle.
  usePersonalPinsSync(enabled && !isPopout);
  React.useEffect(() => {
    if (!enabled || isPopout || !pubkey) return;
    return startInboxStateSync(pubkey);
  }, [enabled, isPopout, pubkey]);
}
