// Generic relay-synced per-user document: one replaceable kind 30078 event per (author, d-tag), content NIP-44
// encrypted to self (appData helpers, so it works with a local key, the desktop signer or a NIP-46 remote signer).
//
// The in-memory doc is the source of truth on this device; a localStorage copy is only a warm-start cache. Remote
// heads are merged with a commutative/idempotent `merge`, so any device can merge any copy in any order. Local edits
// publish after a debounce; a remote head missing something we have gets the union pushed back.
import { relayClient } from "@/shared/api/relayClient";
import { signRelayEvent } from "@/shared/api/tauri";
import type { RelayEvent } from "@/shared/api/types";
import { decryptAppData, encryptAppData } from "@/shared/lib/appData";

export type SyncedDocCodec<D> = {
  empty: () => D;
  /** Tolerant parse; null when the payload is not a doc of this type. */
  parse: (json: unknown) => D | null;
  merge: (a: D, b: D) => D;
  /** Drop expired tombstones / cap sizes. Must be idempotent. */
  prune: (doc: D, nowSeconds: number) => D;
  same: (a: D, b: D) => boolean;
};

export type SyncedDocOptions<D> = {
  pk: string;
  kind: number;
  dTag: string;
  codec: SyncedDocCodec<D>;
  /** localStorage key for the warm-start cache. */
  cacheKey: string;
  debounceMs: number;
  /** Called after the doc changed because of a remote merge (not for local `update`). */
  onRemoteChange?: (doc: D) => void;
  /** Called on bootstrap when there is no remote head (or it could not be read). */
  onBootstrapNoRemote?: (doc: D) => void;
  label?: string;
};

export const nowSec = () => Math.floor(Date.now() / 1000);

export function readJson(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private mode: doc still syncs from memory */
  }
}

export class SyncedDoc<D> {
  doc: D;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastPublished: D | null = null;
  private lastCreatedAt = 0;
  private stopLive: (() => Promise<void>) | null = null;
  private stopped = false;
  readonly pk: string;

  constructor(readonly opts: SyncedDocOptions<D>) {
    this.pk = opts.pk;
    this.doc = opts.codec.parse(readJson(opts.cacheKey)) ?? opts.codec.empty();
  }

  persist() {
    writeJson(this.opts.cacheKey, this.doc);
  }

  /** Replace the doc with a local edit (already merged by the caller) and schedule a publish. */
  update(next: D) {
    if (this.opts.codec.same(next, this.doc)) return;
    this.doc = next;
    this.persist();
    this.schedule();
  }

  /** Merge extra content (e.g. a migration) into the doc and publish it. */
  mergeIn(extra: D) {
    this.update(this.opts.codec.merge(this.doc, extra));
  }

  private async decode(ev: RelayEvent): Promise<D | null> {
    if (ev.pubkey !== this.pk) return null;
    if (ev.created_at > this.lastCreatedAt) this.lastCreatedAt = ev.created_at;
    try {
      return this.opts.codec.parse(JSON.parse(await decryptAppData(ev.content)));
    } catch {
      return null;
    }
  }

  absorb(remote: D) {
    const { codec } = this.opts;
    const merged = codec.prune(codec.merge(this.doc, remote), nowSec());
    const changed = !codec.same(merged, this.doc);
    this.doc = merged;
    if (changed) {
      this.persist();
      this.opts.onRemoteChange?.(this.doc);
    }
    if (!codec.same(merged, remote)) this.schedule();
    else this.lastPublished = merged;
  }

  async start() {
    const filter = { kinds: [this.opts.kind], authors: [this.pk], "#d": [this.opts.dTag] };
    try {
      const events = await relayClient.fetchEvents({ ...filter, limit: 1 });
      const ev = events.find((e) => e.pubkey === this.pk);
      const remote = ev ? await this.decode(ev) : null;
      if (this.stopped) return;
      if (remote) this.absorb(remote);
      else {
        this.opts.onBootstrapNoRemote?.(this.doc);
        // An undecryptable head must not be overwritten blindly.
        if (!ev) this.schedule();
      }
    } catch (error) {
      console.warn(`[${this.opts.label ?? this.opts.dTag}] bootstrap failed:`, error);
    }
    if (this.stopped) return;
    try {
      const stop = await relayClient.subscribeLive({ ...filter, limit: 0 }, (ev) => {
        void this.decode(ev).then((remote) => {
          if (remote && !this.stopped) this.absorb(remote);
        });
      });
      if (this.stopped) void stop();
      else this.stopLive = stop;
    } catch (error) {
      console.warn(`[${this.opts.label ?? this.opts.dTag}] live subscribe failed:`, error);
    }
  }

  private schedule() {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.publish();
    }, this.opts.debounceMs);
  }

  flush() {
    if (!this.timer) return;
    clearTimeout(this.timer);
    this.timer = null;
    void this.publish();
  }

  private async publish() {
    if (this.stopped) return;
    const { codec } = this.opts;
    const doc = codec.prune(this.doc, nowSec());
    if (this.lastPublished && codec.same(doc, this.lastPublished)) return;
    try {
      const content = await encryptAppData(JSON.stringify(doc));
      const event = await signRelayEvent({
        kind: this.opts.kind,
        content,
        createdAt: Math.max(nowSec(), this.lastCreatedAt + 1),
        tags: [["d", this.opts.dTag]],
      });
      if (this.stopped) return;
      await relayClient.publishEvent(
        event,
        `Timed out publishing ${this.opts.label ?? "synced data"}.`,
        `Failed to publish ${this.opts.label ?? "synced data"}.`,
      );
      this.lastCreatedAt = event.created_at;
      this.lastPublished = doc;
    } catch (error) {
      console.warn(`[${this.opts.label ?? this.opts.dTag}] publish failed:`, error);
    }
  }

  stop() {
    this.flush();
    this.stopped = true;
    void this.stopLive?.();
  }
}
