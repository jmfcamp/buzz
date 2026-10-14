// Phone Me tab ([data-phone] only; the phone layout has no sidebar): pinned sites list. Each row opens /pins/<id>
// full-screen (tab bar hidden, PhoneNavRow Back returns here); "Manage" opens Settings → Pinned sites.
import { ChevronRight } from "lucide-react";

import { PhoneTabLongPress } from "./PhoneTabLongPress";
import { usePinnedSites } from "@/features/pinned-sites/hooks";
import { getPinnedSiteIcon } from "@/features/pinned-sites/lib/icons";

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function PhonePinnedSitesCard({
  onOpen,
  onManage,
}: {
  onOpen: (pinId: string) => void;
  onManage: () => void;
}) {
  const { pins } = usePinnedSites();
  return (
    <section className="pt-5" data-testid="phone-me-pinned-sites">
      <div className="flex items-center justify-between px-5 pb-1.5">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Pinned sites
        </h2>
        <button
          className="text-xs font-medium text-primary active:opacity-70"
          data-testid="phone-me-pinned-sites-manage"
          onClick={onManage}
          type="button"
        >
          Manage
        </button>
      </div>
      {pins.length === 0 ? (
        <div className="mx-3 rounded-xl border border-border bg-card px-4 py-3.5 text-sm text-muted-foreground">
          No pinned sites yet. Tap Manage to add one.
        </div>
      ) : (
        <ul className="mx-3 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {pins.map((pin) => {
            const Icon = getPinnedSiteIcon(pin.icon);
            return (
              <li key={pin.id}>
                <PhoneTabLongPress
                  label={pin.name}
                  target={{ kind: "pin", pinId: pin.id }}
                >
                  <button
                    className="phone-long-press flex w-full items-center gap-3 px-4 py-3 text-left active:bg-accent"
                    data-testid={`phone-me-pin-${pin.id}`}
                    onClick={() => onOpen(pin.id)}
                    type="button"
                  >
                    <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px]">
                        {pin.name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {hostOf(pin.url)}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                </PhoneTabLongPress>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
