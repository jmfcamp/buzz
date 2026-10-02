/** A fullscreen tab points at a surface the left panel already opens. */
export type SurfaceTabTarget =
  | { kind: "home" }
  | { kind: "pulse" }
  | { kind: "projects" }
  | { kind: "project"; projectId: string }
  | { kind: "agents" }
  | { kind: "bots" }
  | { kind: "browsers" }
  | { kind: "workflows" }
  | { kind: "pin"; pinId: string }
  | { kind: "channel"; channelId: string }
  | { kind: "thread"; channelId: string; rootId: string }
  | { kind: "buzz-term" }
  | { kind: "assistant" };

/** One tab in the top strip. `label` is the full name; the strip truncates it. */
export type SurfaceTab = {
  id: string;
  label: string;
  target: SurfaceTabTarget;
};

/** Visible name length before the ellipsis. */
export const SURFACE_TAB_LABEL_MAX = 30;

/** Cap so a long-lived client cannot grow the strip without bound. */
export const SURFACE_TAB_LIMIT = 20;

const STORAGE_PREFIX = "buzz-surface-tabs.v1:";

/**
 * Storage key for one community. An empty id uses a local bucket so tabs
 * are not written under another community's key.
 */
export function surfaceTabsStorageKey(communityId: string): string {
  const scope = communityId.trim() || "none";
  return `${STORAGE_PREFIX}${scope}`;
}

/** Full label used for storage, tooltips, and the accessible name. */
export function surfaceTabFullLabel(label: string): string {
  const trimmed = label.trim();
  return trimmed || "Untitled";
}

/**
 * Truncate a tab name to 30 characters plus an ellipsis.
 * Counts Unicode code points so a long name does not split a pair.
 */
export function truncateSurfaceTabLabel(label: string): string {
  const full = surfaceTabFullLabel(label);
  const chars = Array.from(full);
  if (chars.length <= SURFACE_TAB_LABEL_MAX) return full;
  return `${chars.slice(0, SURFACE_TAB_LABEL_MAX).join("")}…`;
}

/** Stable identity so the same surface is not added twice. */
export function surfaceTabKey(target: SurfaceTabTarget): string {
  switch (target.kind) {
    case "home":
    case "pulse":
    case "projects":
    case "agents":
    case "bots":
    case "browsers":
    case "workflows":
    case "buzz-term":
    case "assistant":
      return target.kind;
    case "project":
      return `project:${target.projectId}`;
    case "pin":
      return `pin:${target.pinId}`;
    case "channel":
      return `channel:${target.channelId}`;
    case "thread":
      return `thread:${target.channelId}:${target.rootId}`;
    default: {
      const unreachable: never = target;
      return unreachable;
    }
  }
}

/**
 * Insert a tab or focus the existing one for the same surface.
 * A new tab past the cap drops the oldest tab.
 */
export function insertSurfaceTab(
  tabs: readonly SurfaceTab[],
  input: { label: string; target: SurfaceTabTarget },
  createId: () => string = () => crypto.randomUUID(),
): { tabs: SurfaceTab[]; id: string } {
  const label = surfaceTabFullLabel(input.label);
  const key = surfaceTabKey(input.target);
  const existing = tabs.find((tab) => surfaceTabKey(tab.target) === key);
  if (existing) {
    return {
      id: existing.id,
      tabs: tabs.map((tab) =>
        tab.id === existing.id ? { ...tab, label, target: input.target } : tab,
      ),
    };
  }

  const next = [...tabs, { id: createId(), label, target: input.target }];
  while (next.length > SURFACE_TAB_LIMIT) {
    next.shift();
  }
  const added = next[next.length - 1];
  return { tabs: next, id: added ? added.id : "" };
}

/**
 * Drop the tab for one starred thread.
 * Channel tabs and other threads stay. A blank root removes nothing.
 */
export function surfaceTabsWithoutThread(
  tabs: readonly SurfaceTab[],
  input: { channelId?: string; rootId: string },
): { removedIds: string[]; tabs: readonly SurfaceTab[] } {
  const rootId = input.rootId.trim();
  if (!rootId) return { removedIds: [], tabs };
  const channelId = input.channelId?.trim() ?? "";
  const removedIds: string[] = [];
  const next = tabs.filter((tab) => {
    if (tab.target.kind !== "thread") return true;
    if (tab.target.rootId.trim() !== rootId) return true;
    if (channelId && tab.target.channelId.trim() !== channelId) return true;
    removedIds.push(tab.id);
    return false;
  });
  if (removedIds.length === 0) return { removedIds, tabs };
  return { removedIds, tabs: next };
}

/**
 * Rename the tab for one starred thread.
 * Channel tabs and other threads stay. A blank root changes nothing.
 */
export function surfaceTabsWithThreadLabel(
  tabs: readonly SurfaceTab[],
  input: { channelId?: string; label: string; rootId: string },
): { changed: boolean; tabs: readonly SurfaceTab[] } {
  const rootId = input.rootId.trim();
  if (!rootId) return { changed: false, tabs };
  const channelId = input.channelId?.trim() ?? "";
  const label = surfaceTabFullLabel(input.label);
  let changed = false;
  const next = tabs.map((tab) => {
    if (tab.target.kind !== "thread") return tab;
    if (tab.target.rootId.trim() !== rootId) return tab;
    if (channelId && tab.target.channelId.trim() !== channelId) return tab;
    if (tab.label === label) return tab;
    changed = true;
    return { ...tab, label };
  });
  if (!changed) return { changed: false, tabs };
  return { changed: true, tabs: next };
}

/**
 * 1-based Command/Ctrl number. Returns the tab index, or null when that
 * number has no tab. Home is not numbered.
 */
export function surfaceTabShortcutIndex(
  key: string,
  tabCount: number,
): number | null {
  if (!/^[1-9]$/.test(key)) return null;
  const index = Number(key) - 1;
  if (index >= tabCount) return null;
  return index;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseTarget(value: unknown): SurfaceTabTarget | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  switch (record.kind) {
    case "home":
    case "pulse":
    case "projects":
    case "agents":
    case "bots":
    case "browsers":
    case "workflows":
    case "buzz-term":
    case "assistant":
      return { kind: record.kind };
    case "project":
      return nonEmpty(record.projectId)
        ? { kind: "project", projectId: record.projectId }
        : null;
    case "pin":
      return nonEmpty(record.pinId)
        ? { kind: "pin", pinId: record.pinId }
        : null;
    case "channel":
      return nonEmpty(record.channelId)
        ? { kind: "channel", channelId: record.channelId }
        : null;
    case "thread":
      return nonEmpty(record.channelId) && nonEmpty(record.rootId)
        ? {
            kind: "thread",
            channelId: record.channelId,
            rootId: record.rootId,
          }
        : null;
    default:
      return null;
  }
}

function parseTab(value: unknown): SurfaceTab | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const target = parseTarget(record.target);
  if (!target || !nonEmpty(record.id)) return null;
  const label = surfaceTabFullLabel(
    typeof record.label === "string" ? record.label : "",
  );
  return { id: record.id, label, target };
}

/** Read a stored tab list. Unknown or duplicate entries are dropped. */
export function readStoredSurfaceTabs(raw: string | null): SurfaceTab[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const tabs: SurfaceTab[] = [];
    for (const item of parsed) {
      const tab = parseTab(item);
      if (!tab) continue;
      const key = surfaceTabKey(tab.target);
      if (tabs.some((existing) => surfaceTabKey(existing.target) === key)) {
        continue;
      }
      tabs.push(tab);
      if (tabs.length >= SURFACE_TAB_LIMIT) break;
    }
    return tabs;
  } catch {
    return [];
  }
}

function elementFromTarget(target: EventTarget | null): Element | null {
  if (target instanceof Element) return target;
  if (target instanceof Node) return target.parentElement;
  return null;
}

/**
 * A primary click in the left panel leaves tab mode before the row runs.
 * Typing in search, and menu items, stay put.
 */
export function shouldLeaveTabForSidebarClick(event: {
  button: number;
  target: EventTarget | null;
}): boolean {
  if (event.button !== 0) return false;
  const element = elementFromTarget(event.target);
  if (!element) return false;
  if (element.closest("input, textarea, select, [contenteditable='true']")) {
    return false;
  }
  if (element.closest("[role='menu'], [role='menuitem']")) return false;
  return true;
}
