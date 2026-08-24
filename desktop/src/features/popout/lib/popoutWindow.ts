import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

import type { PlaygroundCard } from "@/features/playground/lib/types";

export const POPOUT_STORAGE_PREFIX = "buzz.popout.v1:";
export const POPOUT_WINDOW_LABEL_PREFIX = "popout-";

export type PopoutKind = "thread" | "playground" | "split";

export type PopoutPayload = {
  kind: PopoutKind;
  channelId?: string;
  threadId?: string;
  playground?: PlaygroundCard;
};

function sanitizeLabelPart(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned.slice(0, 48) || "x";
}

export function popoutStorageKey(label: string): string {
  return `${POPOUT_STORAGE_PREFIX}${label}`;
}

export function popoutLabel(kind: PopoutKind, seed: string): string {
  return `${POPOUT_WINDOW_LABEL_PREFIX}${kind}-${sanitizeLabelPart(seed)}`;
}

export function writePopoutPayload(label: string, payload: PopoutPayload) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      popoutStorageKey(label),
      JSON.stringify(payload),
    );
  } catch {
    // Companion still opens; it just will not know its target.
  }
}

export function readPopoutPayload(
  label = currentPopoutLabel(),
): PopoutPayload | null {
  if (!label || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(popoutStorageKey(label));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PopoutPayload;
    if (
      parsed?.kind !== "thread" &&
      parsed?.kind !== "playground" &&
      parsed?.kind !== "split"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function currentPopoutLabel(): string | null {
  if (!isTauri()) return null;
  try {
    const label = getCurrentWindow().label;
    return label.startsWith(POPOUT_WINDOW_LABEL_PREFIX) ? label : null;
  } catch {
    return null;
  }
}

export function currentPopoutPayload(): PopoutPayload | null {
  const label = currentPopoutLabel();
  return label ? readPopoutPayload(label) : null;
}

export async function openPopoutWindow(input: {
  kind: PopoutKind;
  title: string;
  seed: string;
  channelId?: string;
  threadId?: string;
  playground?: PlaygroundCard;
}): Promise<void> {
  const label = popoutLabel(input.kind, input.seed);
  writePopoutPayload(label, {
    kind: input.kind,
    ...(input.channelId ? { channelId: input.channelId } : {}),
    ...(input.threadId ? { threadId: input.threadId } : {}),
    ...(input.playground ? { playground: input.playground } : {}),
  });
  if (!isTauri()) {
    return;
  }
  await invoke("open_popout_window", { label, title: input.title });
}
