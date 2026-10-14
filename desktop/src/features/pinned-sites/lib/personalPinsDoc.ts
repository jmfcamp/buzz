// Synced personal pinned sites: kind 30078, d=buzz:personal-pins, NIP-44 to self, one doc per
// community relay (same scope as the local cache key). Per-pin last-writer-wins by `at` with
// 30-day tombstones; `order` carries the list position so every device shows the same order.
import type { PinnedSite, PinnedSiteIconId } from "./types";

export const PERSONAL_PINS_D_TAG = "buzz:personal-pins";
export const PERSONAL_PINS_TOMBSTONE_SECONDS = 30 * 24 * 3600;

export type PinBody = Pick<
  PinnedSite,
  "name" | "url" | "icon" | "pollForChanges" | "openMatchingLinks"
>;
export type PinEntry = {
  on: boolean;
  at: number;
  order: number;
  pin?: PinBody;
};
export type PersonalPinsDoc = { v: 1; pins: Record<string, PinEntry> };

export const emptyPinsDoc = (): PersonalPinsDoc => ({ v: 1, pins: {} });

function wins(a: PinEntry, b: PinEntry) {
  if (a.at !== b.at) return a.at > b.at;
  if (a.on !== b.on) return !a.on;
  return JSON.stringify(a) > JSON.stringify(b);
}

export function parsePinsDoc(json: unknown): PersonalPinsDoc | null {
  const j = json as { v?: unknown; pins?: unknown } | null;
  if (!j || j.v !== 1 || !j.pins || typeof j.pins !== "object") return null;
  const doc = emptyPinsDoc();
  for (const [id, raw] of Object.entries(j.pins as Record<string, any>)) {
    if (
      !id ||
      !raw ||
      typeof raw.on !== "boolean" ||
      typeof raw.at !== "number"
    )
      continue;
    const e: PinEntry = {
      on: raw.on,
      at: Math.floor(raw.at),
      order: Number(raw.order) || 0,
    };
    const p = raw.pin;
    if (
      p &&
      typeof p.name === "string" &&
      typeof p.url === "string" &&
      typeof p.icon === "string"
    )
      e.pin = {
        name: p.name,
        url: p.url,
        icon: p.icon as PinnedSiteIconId,
        pollForChanges: p.pollForChanges === true,
        openMatchingLinks: p.openMatchingLinks !== false,
      };
    if (e.on && !e.pin) continue;
    doc.pins[id] = e;
  }
  return doc;
}

export function mergePinsDocs(
  a: PersonalPinsDoc,
  b: PersonalPinsDoc,
): PersonalPinsDoc {
  const out = emptyPinsDoc();
  for (const src of [a.pins, b.pins])
    for (const [id, e] of Object.entries(src)) {
      const cur = out.pins[id];
      if (!cur || wins(e, cur)) out.pins[id] = e;
    }
  return out;
}

export function prunePinsDoc(
  doc: PersonalPinsDoc,
  now: number,
): PersonalPinsDoc {
  const out = emptyPinsDoc();
  for (const [id, e] of Object.entries(doc.pins))
    if (e.on || e.at >= now - PERSONAL_PINS_TOMBSTONE_SECONDS) out.pins[id] = e;
  return out;
}

/** Live pins in display order. */
export function pinsFromDoc(doc: PersonalPinsDoc): PinnedSite[] {
  return Object.entries(doc.pins)
    .filter(([, e]) => e.on && e.pin)
    .sort((x, y) => x[1].order - y[1].order || (x[0] < y[0] ? -1 : 1))
    .map(([id, e]) => ({
      id,
      ...(e.pin as PinBody),
      scope: "personal" as const,
    }));
}

const body = (p: PinnedSite): PinBody => ({
  name: p.name,
  url: p.url,
  icon: p.icon,
  pollForChanges: p.pollForChanges,
  openMatchingLinks: p.openMatchingLinks !== false,
});

/**
 * Fold a device's full new list into the doc: added/changed/moved pins get a fresh stamp,
 * removed pins become tombstones. `at` always moves past what this device last saw.
 */
export function applyLocalPins(
  doc: PersonalPinsDoc,
  pins: readonly PinnedSite[],
  now: number,
): PersonalPinsDoc {
  const out: PersonalPinsDoc = { v: 1, pins: { ...doc.pins } };
  const stamp = (id: string) => Math.max(now, (doc.pins[id]?.at ?? 0) + 1);
  pins.forEach((p, order) => {
    const cur = doc.pins[p.id];
    const next = body(p);
    if (
      cur?.on &&
      cur.order === order &&
      JSON.stringify(cur.pin) === JSON.stringify(next)
    )
      return;
    out.pins[p.id] = { on: true, at: stamp(p.id), order, pin: next };
  });
  const keep = new Set(pins.map((p) => p.id));
  for (const [id, e] of Object.entries(doc.pins))
    if (e.on && !keep.has(id))
      out.pins[id] = { on: false, at: stamp(id), order: e.order };
  return out;
}

/** First-run union: local pins stamped at=1 so any real remote decision beats them; appended after remote order. */
export function unionLocalPins(
  doc: PersonalPinsDoc,
  pins: readonly PinnedSite[],
): PersonalPinsDoc {
  const base = Object.values(doc.pins).reduce(
    (m, e) => Math.max(m, e.order + 1),
    0,
  );
  const add = emptyPinsDoc();
  pins.forEach((p, i) => {
    add.pins[p.id] = { on: true, at: 1, order: base + i, pin: body(p) };
  });
  return mergePinsDocs(doc, add);
}

export function samePinsDoc(a: PersonalPinsDoc, b: PersonalPinsDoc) {
  const ka = Object.keys(a.pins);
  if (ka.length !== Object.keys(b.pins).length) return false;
  return ka.every((id) => {
    const x = a.pins[id];
    const y = b.pins[id];
    return y && x.at === y.at && x.on === y.on && x.order === y.order;
  });
}
