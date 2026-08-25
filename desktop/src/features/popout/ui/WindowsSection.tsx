import { AppWindow, Columns2, MessageSquare } from "lucide-react";
import { useSyncExternalStore } from "react";

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/shared/ui/sidebar";
import { SidebarMenuLabel } from "@/shared/ui/sidebar-menu-label";

import {
  focusPopoutWindow,
  getPopoutWindows,
  popoutKindFromLabel,
  subscribePopoutWindows,
} from "../lib/popoutWindows";

function PopoutRowIcon({ label }: { label: string }) {
  const kind = popoutKindFromLabel(label);
  const className = "h-4 w-4";
  if (kind === "split") return <Columns2 className={className} />;
  if (kind === "thread") return <MessageSquare className={className} />;
  return <AppWindow className={className} />;
}

export function WindowsSection() {
  const rows = useSyncExternalStore(
    subscribePopoutWindows,
    getPopoutWindows,
    getPopoutWindows,
  );
  if (rows.length === 0) return null;

  return (
    <SidebarGroup data-testid="windows-section">
      <SidebarGroupLabel data-testid="windows-section-label">
        Windows
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {rows.map((row) => (
            <SidebarMenuItem key={row.label}>
              <SidebarMenuButton
                className="data-[active=true]:font-normal"
                data-testid={`open-window-${row.label}`}
                onClick={() => {
                  void focusPopoutWindow(row.label);
                }}
                tooltip={row.title}
                type="button"
              >
                <PopoutRowIcon label={row.label} />
                <SidebarMenuLabel>{row.title}</SidebarMenuLabel>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
