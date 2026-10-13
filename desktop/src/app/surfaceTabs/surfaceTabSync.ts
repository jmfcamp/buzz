/**
 * Cross-device tab sync (desktop <-> web) on the sidebar lane machinery:
 * kind 30078, d-tag `surface-tabs`, NIP-44 to self, scoped per pubkey + relay
 * (one relay per community).
 *
 * Document: `{ t: { [tabKey]: Reg<{label,target} | null> }, o: Reg<tabKey[]> }`
 * - tabKey is `surfaceTabKey(target)`, identical on every device, so the same
 *   surface is one tab everywhere (stable id).
 * - Each tab is its own last-writer-wins register; closing writes a `null`
 *   tombstone so a stale device cannot resurrect it.
 * - Order is a separate register: reordering never clobbers a label, and a
 *   tab another device opened concurrently still shows (appended).
 */
import { normalizeRelayUrl } from "@/shared/lib/normalizeRelayUrl";
import type { Lane } from "@/features/sidebar/lib/sidebarLaneReconciler";
import { isReg, own, type Reg, setRegs, type Tree } from "@/features/sidebar/lib/sidebarLwwMap";
import {
  type SurfaceTab,
  type SurfaceTabTarget,
  SURFACE_TAB_LIMIT,
  parseSurfaceTabTarget,
  surfaceTabFullLabel,
  surfaceTabKey,
} from "./surfaceTabModel";

const STORAGE_PREFIX = "buzz-surface-tabs-sync.v1";
/** Live + tombstoned entries kept in one event (well under the size cap). */
export const SURFACE_TAB_SYNC_MAX_ENTRIES = 300;

type TabValue = { label: string; target: SurfaceTabTarget };

function isTabValue(value: unknown): boolean {
  if (value === null) return true;
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.label === "string" &&
    parseSurfaceTabTarget(record.target) !== null
  );
}

export function surfaceTabSyncStorageKey(pubkey: string, relayUrl: string) {
  return `${STORAGE_PREFIX}:${pubkey}:${encodeURIComponent(normalizeRelayUrl(relayUrl))}`;
}

/** Visible tabs: order register first, then unordered live tabs by version. */
export function projectSurfaceTabs(tree: Tree): SurfaceTab[] {
  const entries = tree.t && !isReg(tree.t) ? tree.t : {};
  const live = new Map<string, { tab: SurfaceTab; v: number }>();
  for (const [key, reg] of Object.entries(entries)) {
    if (!isReg(reg) || reg[2] === null) continue;
    const value = reg[2] as TabValue;
    const target = parseSurfaceTabTarget(value.target);
    if (!target || surfaceTabKey(target) !== key) continue;
    live.set(key, {
      tab: { id: key, label: surfaceTabFullLabel(value.label), target },
      v: reg[0],
    });
  }
  const order = isReg(tree.o) && Array.isArray(tree.o[2]) ? (tree.o[2] as string[]) : [];
  const out: SurfaceTab[] = [];
  const seen = new Set<string>();
  for (const key of order) {
    const hit = live.get(key);
    if (!hit || seen.has(key)) continue;
    seen.add(key);
    out.push(hit.tab);
  }
  const rest = [...live.entries()]
    .filter(([key]) => !seen.has(key))
    .sort((a, b) => a[1].v - b[1].v || (a[0] < b[0] ? -1 : 1));
  for (const [, { tab }] of rest) out.push(tab);
  // Newest win the cap, matching insertSurfaceTab dropping the oldest.
  return out.slice(Math.max(0, out.length - SURFACE_TAB_LIMIT));
}

/** Local tabs keyed by surface so ids match the synced ones. */
export function withStableTabIds(tabs: readonly SurfaceTab[]): SurfaceTab[] {
  return tabs.map((tab) => ({ ...tab, id: surfaceTabKey(tab.target) }));
}

/**
 * Registers for moving from `prev` to `next`: changed/added tabs, tombstones
 * for removed ones, and the order when it changed. Returns `tree` unchanged
 * when nothing differs.
 */
export function surfaceTabEdits(
  tree: Tree,
  prev: readonly SurfaceTab[],
  next: readonly SurfaceTab[],
): Tree {
  const writes: Array<[string[], unknown]> = [];
  const nextKeys = new Set(next.map((tab) => surfaceTabKey(tab.target)));
  for (const tab of prev) {
    const key = surfaceTabKey(tab.target);
    if (!nextKeys.has(key)) writes.push([["t", key], null]);
  }
  const prevByKey = new Map(prev.map((tab) => [surfaceTabKey(tab.target), tab]));
  for (const tab of next) {
    const key = surfaceTabKey(tab.target);
    const before = prevByKey.get(key);
    const value: TabValue = { label: tab.label, target: tab.target };
    if (!before || before.label !== tab.label || JSON.stringify(before.target) !== JSON.stringify(tab.target))
      writes.push([["t", key], value]);
  }
  const order = next.map((tab) => surfaceTabKey(tab.target));
  const prevOrder = prev.map((tab) => surfaceTabKey(tab.target));
  if (order.join("\n") !== prevOrder.join("\n")) writes.push([["o"], order]);
  if (writes.length === 0) return tree;
  return pruneTombstones(setRegs(tree, writes));
}

/** Seed: local tabs the document has never seen (live or tombstoned). */
export function seedSurfaceTabs(tree: Tree, local: readonly SurfaceTab[]): Tree {
  const entries = tree.t && !isReg(tree.t) ? tree.t : {};
  const missing = local.filter((tab) => own(entries, surfaceTabKey(tab.target)) === undefined);
  if (missing.length === 0) return tree;
  const current = projectSurfaceTabs(tree);
  const writes: Array<[string[], unknown]> = missing.map((tab) => [
    ["t", surfaceTabKey(tab.target)],
    { label: tab.label, target: tab.target },
  ]);
  writes.push([["o"], [...current, ...missing].map((tab) => surfaceTabKey(tab.target))]);
  return setRegs(tree, writes);
}

/** Drop the oldest tombstones once the document grows past the entry cap. */
function pruneTombstones(tree: Tree): Tree {
  const entries = tree.t && !isReg(tree.t) ? tree.t : {};
  const keys = Object.keys(entries);
  if (keys.length <= SURFACE_TAB_SYNC_MAX_ENTRIES) return tree;
  const tombs = keys
    .map((key) => [key, entries[key]] as const)
    .filter(([, reg]) => isReg(reg) && reg[2] === null)
    .sort((a, b) => (a[1] as Reg)[0] - (b[1] as Reg)[0]);
  const drop = new Set(tombs.slice(0, keys.length - SURFACE_TAB_SYNC_MAX_ENTRIES).map(([k]) => k));
  const t: Tree = {};
  for (const key of keys) if (!drop.has(key)) t[key] = entries[key];
  return { ...tree, t };
}

export const SURFACE_TABS_LANE: Lane = {
  dTag: "surface-tabs",
  storageKey: surfaceTabSyncStorageKey,
  shape: { t: { "*": isTabValue }, o: (v) => Array.isArray(v) && v.every((k) => typeof k === "string") },
  fromLegacy: () => null,
  project: (tree) => ({ tabs: projectSurfaceTabs(tree) }),
  withinLimits: (p) => Array.isArray(p.tabs) && (p.tabs as unknown[]).length <= SURFACE_TAB_LIMIT,
};
