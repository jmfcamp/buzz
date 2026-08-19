export type PinnedSiteScope = "personal" | "community";

export type PinnedSiteIconId =
  | "compass"
  | "map-pin"
  | "globe"
  | "link"
  | "bookmark"
  | "house"
  | "newspaper"
  | "book-open"
  | "calendar"
  | "mail"
  | "message-square"
  | "video"
  | "music"
  | "image"
  | "file-text"
  | "code"
  | "terminal"
  | "layout-dashboard"
  | "bar-chart"
  | "users"
  | "briefcase"
  | "shopping-cart"
  | "heart"
  | "star"
  | "search";

export type PinnedSiteDraft = {
  name: string;
  url: string;
  icon: PinnedSiteIconId;
  pollForChanges: boolean;
  community: boolean;
};

export type PinnedSite = {
  id: string;
  name: string;
  url: string;
  icon: PinnedSiteIconId;
  pollForChanges: boolean;
  scope: PinnedSiteScope;
};

export const WAYFINDER_PIN_ID = "wayfinder";

export const WAYFINDER_PIN: PinnedSite = {
  id: WAYFINDER_PIN_ID,
  name: "Wayfinder",
  url: "https://wayfinder.huladesk.com",
  icon: "compass",
  pollForChanges: false,
  scope: "personal",
};

export const PINNED_SITES_POLL_INTERVAL_MS = 60_000;
