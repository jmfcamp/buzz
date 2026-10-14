// Relay sync for personal pinned sites (see personalPinsDoc.ts). The local blob
// (`buzz-pinned-sites.v1:<pubkey>:<relay>`) stays as the cache every pin UI reads;
// this module merges it with the relay doc, rewrites it on remote changes, and
// publishes local edits reported through `recordPersonalPins`.
import { relayClient } from "@/shared/api/relayClient";
import { signRelayEvent } from "@/shared/api/tauri";
import type { RelayEvent } from "@/shared/api/types";
import { decryptAppData, encryptAppData } from "@/shared/lib/appData";
import { normalizeRelayUrl } from "@/shared/lib/normalizeRelayUrl";

import {
  applyLocalPins,
  emptyPinsDoc,
  mergePinsDocs,
  parsePinsDoc,
  PERSONAL_PINS_D_TAG,
  type PersonalPinsDoc,
  pinsFromDoc,
  prunePinsDoc,
  samePinsDoc,
  unionLocalPins,
} from "./personalPinsDoc";
import {
  loadPersonalPinnedSites,
  savePersonalPinnedSites,
} from "./personalPins";
import type { PinnedSite } from "./types";

const KIND = 30078;
const DEBOUNCE_MS = 3_000;
/** Fired after the local pin cache was rewritten from the synced doc. */
export const PERSONAL_PINS_APPLIED_EVENT = "buzz-personal-pins-applied";

const nowSec = () => Math.floor(Date.now() / 1000);
const scopeKey = (pk: string, relay: string) =>
  `${pk}:${encodeURIComponent(normalizeRelayUrl(relay))}`;

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function writeJson(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* memory only */
  }
}

class PersonalPinsSync {
  doc: PersonalPinsDoc;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastPublished: PersonalPinsDoc | null = null;
  private lastCreatedAt = 0;
  private stopLive: (() => Promise<void>) | null = null;
  private stopped = false;
  private readonly cacheKey: string;

  constructor(
    readonly pk: string,
    readonly relayUrl: string,
  ) {
    const scope = scopeKey(pk, relayUrl);
    this.cacheKey = `buzz-personal-pins-doc.v1:${scope}`;
    this.doc = parsePinsDoc(readJson(this.cacheKey)) ?? emptyPinsDoc();
    const migratedKey = `buzz-personal-pins-migrated.v1:${scope}`;
    if (!readJson(migratedKey)) {
      // Union this device's existing list (desktop store or this browser's list).
      this.doc = unionLocalPins(
        this.doc,
        loadPersonalPinnedSites(pk, relayUrl).pins,
      );
      writeJson(migratedKey, nowSec());
      writeJson(this.cacheKey, this.doc);
    }
  }

  private project() {
    savePersonalPinnedSites(this.pk, this.relayUrl, {
      version: 1,
      wayfinderSeeded: true,
      pins: pinsFromDoc(this.doc),
    });
    window.dispatchEvent(new CustomEvent(PERSONAL_PINS_APPLIED_EVENT));
  }

  private async decode(ev: RelayEvent) {
    if (ev.pubkey !== this.pk) return null;
    if (ev.created_at > this.lastCreatedAt) this.lastCreatedAt = ev.created_at;
    try {
      return parsePinsDoc(JSON.parse(await decryptAppData(ev.content)));
    } catch {
      return null;
    }
  }

  private absorb(remote: PersonalPinsDoc) {
    const merged = prunePinsDoc(mergePinsDocs(this.doc, remote), nowSec());
    const changed = !samePinsDoc(merged, this.doc);
    this.doc = merged;
    writeJson(this.cacheKey, this.doc);
    if (changed) this.project();
    if (!samePinsDoc(merged, remote)) this.schedule();
    else this.lastPublished = merged;
  }

  async start() {
    const filter = {
      kinds: [KIND],
      authors: [this.pk],
      "#d": [PERSONAL_PINS_D_TAG],
    };
    try {
      const evs = await relayClient.fetchEvents({ ...filter, limit: 1 });
      const ev = evs.find((e) => e.pubkey === this.pk);
      const remote = ev ? await this.decode(ev) : null;
      if (this.stopped) return;
      if (remote) this.absorb(remote);
      else {
        this.project();
        if (!ev) this.schedule();
      }
    } catch (e) {
      console.warn("[personalPins] bootstrap failed:", e);
    }
    if (this.stopped) return;
    try {
      const stop = await relayClient.subscribeLive(
        { ...filter, limit: 0 },
        (ev) => {
          void this.decode(ev).then((r) => {
            if (r && !this.stopped) this.absorb(r);
          });
        },
      );
      if (this.stopped) void stop();
      else this.stopLive = stop;
    } catch (e) {
      console.warn("[personalPins] live subscribe failed:", e);
    }
  }

  record(pins: readonly PinnedSite[]) {
    const next = applyLocalPins(this.doc, pins, nowSec());
    if (samePinsDoc(next, this.doc)) return;
    this.doc = next;
    writeJson(this.cacheKey, this.doc);
    this.schedule();
  }

  private schedule() {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.publish();
    }, DEBOUNCE_MS);
  }

  private async publish() {
    if (this.stopped) return;
    const doc = prunePinsDoc(this.doc, nowSec());
    if (this.lastPublished && samePinsDoc(doc, this.lastPublished)) return;
    try {
      const event = await signRelayEvent({
        kind: KIND,
        content: await encryptAppData(JSON.stringify(doc)),
        createdAt: Math.max(nowSec(), this.lastCreatedAt + 1),
        tags: [["d", PERSONAL_PINS_D_TAG]],
      });
      if (this.stopped) return;
      await relayClient.publishEvent(
        event,
        "Timed out publishing pinned sites.",
        "Failed to publish pinned sites.",
      );
      this.lastCreatedAt = event.created_at;
      this.lastPublished = doc;
    } catch (e) {
      console.warn("[personalPins] publish failed:", e);
    }
  }

  stop() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
      void this.publish();
    }
    this.stopped = true;
    void this.stopLive?.();
  }
}

let active: PersonalPinsSync | null = null;

export function startPersonalPinsSync(
  pubkey: string,
  relayUrl: string,
): () => void {
  active?.stop();
  const sync = new PersonalPinsSync(pubkey, relayUrl);
  active = sync;
  void sync.start();
  return () => {
    sync.stop();
    if (active === sync) active = null;
  };
}

/** Report this device's new full personal list (after add / edit / delete / reorder). */
export function recordPersonalPins(
  pubkey: string,
  relayUrl: string,
  pins: readonly PinnedSite[],
) {
  if (
    !active ||
    active.pk !== pubkey ||
    normalizeRelayUrl(active.relayUrl) !== normalizeRelayUrl(relayUrl)
  )
    return;
  active.record(pins);
}
