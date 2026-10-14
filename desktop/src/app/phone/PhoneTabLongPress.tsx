// Phone Me tab long-press ([data-phone] only): "Add as tab" / "Remove tab", the phone version of the desktop left-nav
// right-click "Add as Tab" (AddSurfaceTabMenuItem). Tabs live in SurfaceTabsProvider (persisted per device, capped at
// SURFACE_TAB_LIMIT, oldest dropped) and show in the floating tab pill (PhoneTabSwitcher).
import { AppWindow, X } from "lucide-react";
import type * as React from "react";
import { toast } from "sonner";

import { useOptionalSurfaceTabs } from "@/app/surfaceTabs/SurfaceTabsProvider";
import {
  surfaceTabKey,
  type SurfaceTabTarget,
} from "@/app/surfaceTabs/surfaceTabModel";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/shared/ui/context-menu";

export function PhoneTabLongPress({
  children,
  label,
  target,
}: {
  children: React.ReactElement;
  label: string;
  target: SurfaceTabTarget | null;
}) {
  const tabs = useOptionalSurfaceTabs();
  if (!tabs || !target) return children;
  const key = surfaceTabKey(target);
  const existing = tabs.tabs.find((t) => surfaceTabKey(t.target) === key);
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        {existing ? (
          <ContextMenuItem
            data-testid="phone-remove-tab"
            onSelect={() => {
              tabs.closeTab(existing.id);
              toast(`Removed ${label} from tabs`);
            }}
          >
            <X className="mr-2 h-4 w-4" />
            Remove tab
          </ContextMenuItem>
        ) : (
          <ContextMenuItem
            data-testid="phone-add-tab"
            onSelect={() => {
              tabs.addTab({ label, target }, { activate: false });
              toast(`Added ${label} as a tab`);
            }}
          >
            <AppWindow className="mr-2 h-4 w-4" />
            Add as tab
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
