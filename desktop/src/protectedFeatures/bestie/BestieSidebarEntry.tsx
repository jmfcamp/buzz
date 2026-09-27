import { Users } from "lucide-react";
import { toast } from "sonner";

import { useAppNavigation } from "@/app/navigation/useAppNavigation";
import { SidebarMenuButton, SidebarMenuItem } from "@/shared/ui/sidebar";
import { SidebarMenuLabel } from "@/shared/ui/sidebar-menu-label";
import { useBestie } from "./useBestie";

export function BestieSidebarEntry() {
  const bestie = useBestie();
  const { goAgents } = useAppNavigation();
  const label = bestie.assignedAgent?.name ?? "Bestie";

  const handleClick = () => {
    if (!bestie.assignedAgent) {
      void goAgents();
      return;
    }
    void bestie.openConversation().catch((error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "Couldn’t open Bestie conversation",
      );
    });
  };

  return (
    <SidebarMenuItem data-testid="bestie-sidebar-entry">
      <SidebarMenuButton
        disabled={bestie.isOpening}
        onClick={handleClick}
        tooltip={label}
        type="button"
      >
        <Users className="h-4 w-4" />
        <SidebarMenuLabel>{label}</SidebarMenuLabel>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
