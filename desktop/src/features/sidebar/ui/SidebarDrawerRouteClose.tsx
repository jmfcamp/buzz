import * as React from "react";
import { useLocation } from "@tanstack/react-router";
import { isTauri } from "@tauri-apps/api/core";

import { useSidebar } from "@/shared/ui/sidebar";

/**
 * Web slide-in left nav: any navigation that starts inside the open drawer (a search result, a footer menu item,
 * a row whose handler routes) closes it, so the page you went to is what you see. Rendered inside the drawer, so it
 * only runs while the drawer is open; the first render (opening) is not a navigation.
 */
export function SidebarDrawerRouteClose() {
  const { isMobile, openMobile, setOpenMobile } = useSidebar();
  const location = useLocation();
  const key = `${location.pathname}?${location.searchStr ?? ""}#${location.hash ?? ""}`;
  const lastKeyRef = React.useRef(key);
  React.useEffect(() => {
    if (lastKeyRef.current === key) return;
    lastKeyRef.current = key;
    if (isMobile && openMobile && !isTauri()) setOpenMobile(false);
  }, [isMobile, key, openMobile, setOpenMobile]);
  return null;
}
