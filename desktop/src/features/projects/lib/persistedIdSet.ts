import * as React from "react";

/** A Set<string> of ids persisted in localStorage (best-effort). */
export function readPersistedIdSet(key: string): Set<string> {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((v): v is string => typeof v === "string")
        : [],
    );
  } catch {
    return new Set();
  }
}

export function writePersistedIdSet(key: string, ids: ReadonlySet<string>) {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify([...ids]));
  } catch {
    // Persistence is best-effort.
  }
}

export function usePersistedIdSet(
  key: string,
): [
  ReadonlySet<string>,
  (update: (current: Set<string>) => Set<string>) => void,
] {
  const [ids, setIds] = React.useState<ReadonlySet<string>>(() =>
    readPersistedIdSet(key),
  );
  const update = React.useCallback(
    (fn: (current: Set<string>) => Set<string>) => {
      setIds((current) => {
        const next = fn(new Set(current));
        writePersistedIdSet(key, next);
        return next;
      });
    },
    [key],
  );
  return [ids, update];
}
