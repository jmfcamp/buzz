import { getStorageItem, setStorageItem } from "@/shared/lib/safeStorage";

const STORAGE_KEY_PREFIX = "buzz-thread-labels.v1";

/** Cap stored titles so a paste cannot grow the sidebar row without bound. */
export const THREAD_LABEL_NAME_MAX = 80;
/** Cap an emoji glyph or `:shortcode:` stored as the starred-row icon. */
export const THREAD_LABEL_ICON_MAX = 64;
export const MAX_THREAD_LABELS = 500;

export type ThreadLabel = {
  /** Empty when the user cleared the title but kept an icon. */
  name: string;
  icon?: string;
};

export type ThreadLabelStore = {
  version: 1;
  labels: Record<string, ThreadLabel>;
};

export const DEFAULT_THREAD_LABEL_STORE: ThreadLabelStore = Object.freeze({
  version: 1,
  labels: {},
});

export function threadLabelsStorageKey(pubkey: string): string {
  return `${STORAGE_KEY_PREFIX}:${pubkey}`;
}

/** Collapse whitespace and cap the visible thread title. */
export function normalizeThreadLabelName(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, THREAD_LABEL_NAME_MAX);
}

/** Keep a single emoji or shortcode. Blank means no custom icon. */
export function normalizeThreadLabelIcon(value: string | undefined): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "";
  return trimmed.slice(0, THREAD_LABEL_ICON_MAX);
}

export function threadHeaderTitle(
  savedName: string | undefined,
  fallback = "Thread",
): string {
  const name = savedName?.trim() ?? "";
  return name || fallback;
}

export function starredThreadTitle(
  entryTitle: string,
  savedName: string | undefined,
): string {
  const name = savedName?.trim() ?? "";
  return name || entryTitle.trim() || "Thread";
}

function isThreadLabel(value: unknown): value is ThreadLabel {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  if (typeof entry.name !== "string") return false;
  if (entry.name.length > THREAD_LABEL_NAME_MAX) return false;
  if (entry.icon !== undefined) {
    if (typeof entry.icon !== "string") return false;
    if (entry.icon.length === 0 || entry.icon.length > THREAD_LABEL_ICON_MAX) {
      return false;
    }
  }
  const icon = typeof entry.icon === "string" ? entry.icon : "";
  return entry.name.trim().length > 0 || icon.length > 0;
}

export function parseThreadLabelPayload(
  json: unknown,
): ThreadLabelStore | null {
  if (typeof json !== "object" || json === null) return null;
  const obj = json as Record<string, unknown>;
  if (obj.version !== 1) return null;
  const labels: Record<string, ThreadLabel> =
    typeof obj.labels === "object" &&
    obj.labels !== null &&
    !Array.isArray(obj.labels)
      ? Object.fromEntries(
          Object.entries(obj.labels as Record<string, unknown>).filter(
            (entry): entry is [string, ThreadLabel] => {
              if (!entry[0]) return false;
              return isThreadLabel(entry[1]);
            },
          ),
        )
      : {};
  return boundThreadLabelStore({ version: 1, labels });
}

export function boundThreadLabelStore(
  store: ThreadLabelStore,
  preservedKey?: string,
): ThreadLabelStore {
  const keys = Object.keys(store.labels);
  if (keys.length <= MAX_THREAD_LABELS) return store;
  const preserved = preservedKey ? store.labels[preservedKey] : undefined;
  const rest = keys.filter((key) => key !== preservedKey).sort();
  const kept = rest.slice(-(MAX_THREAD_LABELS - (preserved ? 1 : 0)));
  const labels: Record<string, ThreadLabel> = {};
  for (const key of kept) {
    const label = store.labels[key];
    if (label) labels[key] = label;
  }
  if (preserved && preservedKey) labels[preservedKey] = preserved;
  return { version: 1, labels };
}

export function readThreadLabelsStore(pubkey: string): ThreadLabelStore {
  const raw = getStorageItem(threadLabelsStorageKey(pubkey));
  if (!raw) return DEFAULT_THREAD_LABEL_STORE;
  try {
    return (
      parseThreadLabelPayload(JSON.parse(raw)) ?? DEFAULT_THREAD_LABEL_STORE
    );
  } catch {
    return DEFAULT_THREAD_LABEL_STORE;
  }
}

export function writeThreadLabelsStore(
  pubkey: string,
  store: ThreadLabelStore,
): boolean {
  return setStorageItem(
    threadLabelsStorageKey(pubkey),
    JSON.stringify(boundThreadLabelStore(store)),
  );
}
