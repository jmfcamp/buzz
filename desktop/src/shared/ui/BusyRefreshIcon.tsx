import { RefreshCw } from "lucide-react";

import { useBackgroundBusy } from "@/shared/lib/backgroundBusy";

/** Nav-bar Refresh icon that doubles as the background-activity indicator (spins; pulses with reduced motion). */
export function BusyRefreshIcon() {
  const busy = useBackgroundBusy();
  return <RefreshCw aria-hidden="true" className={busy ? "buzz-busy-spin" : undefined} data-busy={busy ? "true" : undefined} />;
}
