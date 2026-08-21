import { AppWindow } from "lucide-react";
import { useSyncExternalStore } from "react";

import { SidebarMenuButton, SidebarMenuItem } from "@/shared/ui/sidebar";
import { SidebarMenuLabel } from "@/shared/ui/sidebar-menu-label";

import {
  getPlaygroundStore,
  showPlaygroundSession,
  subscribePlayground,
} from "../lib/sessions";

export function PlaygroundMenuItems() {
  const { sessions, overlaySid } = useSyncExternalStore(
    subscribePlayground,
    getPlaygroundStore,
    getPlaygroundStore,
  );
  const rows = [...sessions.values()];
  if (rows.length === 0) return null;

  return (
    <>
      {rows.map((session) => (
        <SidebarMenuItem key={session.sid}>
          <SidebarMenuButton
            className="data-[active=true]:font-normal"
            data-testid={`open-playground-${session.sid}`}
            isActive={overlaySid === session.sid}
            onClick={() => showPlaygroundSession(session.sid)}
            tooltip={session.name}
            type="button"
          >
            <AppWindow className="h-4 w-4" />
            <SidebarMenuLabel>{session.name}</SidebarMenuLabel>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </>
  );
}
