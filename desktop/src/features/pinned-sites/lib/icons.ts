import {
  Bookmark,
  BookOpen,
  Briefcase,
  Calendar,
  ChartColumn,
  Code,
  Compass,
  FileText,
  Globe,
  Heart,
  House,
  Image as ImageIcon,
  LayoutDashboard,
  Link,
  Mail,
  MapPin,
  MessageSquare,
  Music,
  Newspaper,
  Search,
  ShoppingCart,
  Star,
  Terminal,
  Users,
  Video,
  type LucideIcon,
} from "lucide-react";

import type { PinnedSiteIconId } from "./types";

export const PINNED_SITE_ICONS: ReadonlyArray<{
  id: PinnedSiteIconId;
  label: string;
  Icon: LucideIcon;
}> = [
  { id: "compass", label: "Compass", Icon: Compass },
  { id: "map-pin", label: "Map pin", Icon: MapPin },
  { id: "globe", label: "Globe", Icon: Globe },
  { id: "link", label: "Link", Icon: Link },
  { id: "bookmark", label: "Bookmark", Icon: Bookmark },
  { id: "house", label: "Home", Icon: House },
  { id: "newspaper", label: "Newspaper", Icon: Newspaper },
  { id: "book-open", label: "Book", Icon: BookOpen },
  { id: "calendar", label: "Calendar", Icon: Calendar },
  { id: "mail", label: "Mail", Icon: Mail },
  { id: "message-square", label: "Chat", Icon: MessageSquare },
  { id: "video", label: "Video", Icon: Video },
  { id: "music", label: "Music", Icon: Music },
  { id: "image", label: "Image", Icon: ImageIcon },
  { id: "file-text", label: "Document", Icon: FileText },
  { id: "code", label: "Code", Icon: Code },
  { id: "terminal", label: "Terminal", Icon: Terminal },
  { id: "layout-dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { id: "bar-chart", label: "Chart", Icon: ChartColumn },
  { id: "users", label: "People", Icon: Users },
  { id: "briefcase", label: "Briefcase", Icon: Briefcase },
  { id: "shopping-cart", label: "Cart", Icon: ShoppingCart },
  { id: "heart", label: "Heart", Icon: Heart },
  { id: "star", label: "Star", Icon: Star },
  { id: "search", label: "Search", Icon: Search },
];

const ICON_BY_ID = new Map(PINNED_SITE_ICONS.map((entry) => [entry.id, entry]));

export function isPinnedSiteIconId(value: unknown): value is PinnedSiteIconId {
  return typeof value === "string" && ICON_BY_ID.has(value as PinnedSiteIconId);
}

export function getPinnedSiteIcon(id: string): LucideIcon {
  return ICON_BY_ID.get(id as PinnedSiteIconId)?.Icon ?? Compass;
}
