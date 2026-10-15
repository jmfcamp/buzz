// Relay-synced personal thread titles/icons: kind 30078, d=buzz:thread-labels, NIP-44 to self.
//
//   { v: 1, labels: { <rootId>: { on, at, name?, icon? } } }
//
// Each root is last-writer-wins by `at` (seconds). Clearing a rename writes a tombstone
// (`on: false`) kept 30 days so a stale device cannot resurrect it. Pure module: no React,
// no storage, no relay (tests import it directly). Surface-tabs stay a separate doc.
import {
  MAX_THREAD_LABELS,
  THREAD_LABEL_ICON_MAX,
  THREAD_LABEL_NAME_MAX,
  type ThreadLabel,
  type ThreadLabelStore,
  boundThreadLabelStore,
  normalizeThreadLabelIcon,
  normalizeThreadLabelName,
} from "./threadLabels";

export const THREAD_LABELS_KIND = 30078;
export const THREAD_LABELS_D_TAG = "buzz:thread-labels";
export const THREAD_LABELS_TOMBSTONE_SECONDS = 30 * 24 * 3600;

export type ThreadLabelEntry = {
  on: boolean;
  at: number;
  name?: string;
  icon?: string;
};

export type ThreadLabelsDoc = {
  v: 1;
  labels: Record<string, ThreadLabelEntry>;
};

export function emptyThreadLabelsDoc(): ThreadLabelsDoc {
  return { v: 1, labels: {} };
}

const num = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

function wins(a: ThreadLabelEntry, b: ThreadLabelEntry): boolean {
  if (a.at !== b.at) return a.at > b.at;
  if (a.on !== b.on) return !a.on;
  const as = JSON.stringify({ name: a.name ?? "", icon: a.icon ?? "" });
  const bs = JSON.stringify({ name: b.name ?? "", icon: b.icon ?? "" });
  return as > bs;
}

function parseEntry(raw: unknown): ThreadLabelEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.on !== "boolean" || !num(r.at)) return null;
  const entry: ThreadLabelEntry = { on: r.on, at: Math.floor(r.at) };
  if (r.on) {
    const name =
      typeof r.name === "string"
        ? normalizeThreadLabelName(r.name)
        : "";
    const icon =
      typeof r.icon === "string"
        ? normalizeThreadLabelIcon(r.icon)
        : "";
    if (!name && !icon) return null;
    if (name.length > THREAD_LABEL_NAME_MAX) return null;
    if (icon.length > THREAD_LABEL_ICON_MAX) return null;
    entry.name = name;
    if (icon) entry.icon = icon;
  }
  return entry;
}

/** Tolerant parse: unknown fields dropped, malformed entries skipped. */
export function parseThreadLabelsDoc(json: unknown): ThreadLabelsDoc | null {
  if (!json || typeof json !== "object") return null;
  const j = json as Record<string, unknown>;
  if (j.v !== 1 || !j.labels || typeof j.labels !== "object") return null;
  const doc = emptyThreadLabelsDoc();
  for (const [id, raw] of Object.entries(
    j.labels as Record<string, unknown>,
  )) {
    if (!id) continue;
    const e = parseEntry(raw);
    if (e) doc.labels[id] = e;
  }
  return doc;
}

/** Commutative, associative, idempotent. */
export function mergeThreadLabelsDoc(
  a: ThreadLabelsDoc,
  b: ThreadLabelsDoc,
): ThreadLabelsDoc {
  const out = emptyThreadLabelsDoc();
  for (const src of [a.labels, b.labels]) {
    for (const [id, e] of Object.entries(src)) {
      const cur = out.labels[id];
      if (!cur || wins(e, cur)) out.labels[id] = e;
    }
  }
  return out;
}

export function pruneThreadLabelsDoc(
  doc: ThreadLabelsDoc,
  nowSeconds: number,
): ThreadLabelsDoc {
  const out = emptyThreadLabelsDoc();
  const cutoff = nowSeconds - THREAD_LABELS_TOMBSTONE_SECONDS;
  const entries = Object.entries(doc.labels).filter(
    ([, e]) => e.on || e.at >= cutoff,
  );
  const live = entries
    .filter(([, e]) => e.on)
    .sort((x, y) => y[1].at - x[1].at || (x[0] < y[0] ? -1 : 1))
    .slice(0, MAX_THREAD_LABELS);
  const tombs = entries.filter(([, e]) => !e.on);
  for (const [id, e] of [...tombs, ...live]) out.labels[id] = e;
  return out;
}

function canonical(doc: ThreadLabelsDoc): string {
  const sorted = Object.fromEntries(
    Object.entries(doc.labels).sort(([a], [b]) => (a < b ? -1 : 1)),
  );
  return JSON.stringify(sorted);
}

export function sameThreadLabelsDoc(
  a: ThreadLabelsDoc,
  b: ThreadLabelsDoc,
): boolean {
  return canonical(a) === canonical(b);
}

/** Live labels for the UI store (localStorage projection). */
export function threadLabelStoreFromDoc(
  doc: ThreadLabelsDoc,
): ThreadLabelStore {
  const labels: Record<string, ThreadLabel> = {};
  for (const [id, e] of Object.entries(doc.labels)) {
    if (!e.on) continue;
    const name = e.name ?? "";
    const icon = e.icon ?? "";
    if (!name && !icon) continue;
    labels[id] = icon ? { name, icon } : { name };
  }
  return boundThreadLabelStore({ version: 1, labels });
}

/**
 * Write or clear one root's label. `at` always moves past what this device last
 * saw for that root so concurrent remote edits lose to the local write.
 */
export function setThreadLabelEntry(
  doc: ThreadLabelsDoc,
  rootId: string,
  patch: { name: string; icon?: string } | null,
  now: number,
): ThreadLabelsDoc {
  const id = rootId.trim();
  if (!id) return doc;
  const stamp = Math.max(now, (doc.labels[id]?.at ?? 0) + 1);
  if (!patch) {
    return {
      ...doc,
      labels: { ...doc.labels, [id]: { on: false, at: stamp } },
    };
  }
  const name = normalizeThreadLabelName(patch.name);
  const icon = normalizeThreadLabelIcon(patch.icon);
  if (!name && !icon) {
    return {
      ...doc,
      labels: { ...doc.labels, [id]: { on: false, at: stamp } },
    };
  }
  const entry: ThreadLabelEntry = { on: true, at: stamp, name };
  if (icon) entry.icon = icon;
  return { ...doc, labels: { ...doc.labels, [id]: entry } };
}

/**
 * First-run union: local labels stamped at=1 so any real remote decision beats
 * them. Existing remote entries for the same root are left alone.
 */
export function unionLocalThreadLabels(
  doc: ThreadLabelsDoc,
  local: ThreadLabelStore,
): ThreadLabelsDoc {
  const add = emptyThreadLabelsDoc();
  for (const [id, label] of Object.entries(local.labels)) {
    if (!id) continue;
    if (doc.labels[id] !== undefined) continue;
    const name = normalizeThreadLabelName(label.name);
    const icon = normalizeThreadLabelIcon(label.icon);
    if (!name && !icon) continue;
    const entry: ThreadLabelEntry = { on: true, at: 1, name };
    if (icon) entry.icon = icon;
    add.labels[id] = entry;
  }
  if (Object.keys(add.labels).length === 0) return doc;
  return mergeThreadLabelsDoc(doc, add);
}
