// Exposes this desktop's Assistant jobs / coffee / scratch / threads to the web over Direct (read + a fixed set of
// actions). The features keep running here; nothing moves to the relay. directCmd.ts redacts secrets on the way out.
import {
  type AssistantDataKind,
  setAssistantDirectBackend,
} from "@/features/assistantData/directBackend";

import { BESTIE_COFFEE_BREW_EVENT } from "./bestieCoffeeSchedule";
import {
  getBestieCoffeeState,
  removeBestieCoffeeEntryForScope,
  setBestieCoffeePrefsForScope,
} from "./bestieCoffeeStore";
import type { BestieJobSchedule } from "./bestieJobTypes";
import {
  addBestieJobForScope,
  getBestieJobState,
  removeBestieJobForScope,
  updateBestieJobForScope,
} from "./bestieJobStore";
import type { BestieListScope } from "./bestieListTypes";
import {
  addBestieScratchNoteForScope,
  getBestieScratchState,
  removeBestieScratchNoteForScope,
  updateBestieScratchNoteForScope,
} from "./bestieScratchStore";
import { BESTIE_THREAD_SUMMARIZE_EVENT } from "./bestieThreadProtocol";
import {
  beginBestieThreadSummarizeForScope,
  getBestieThreadState,
  removeBestieTrackedThreadForScope,
} from "./bestieThreadStore";

class BadInput extends Error {}
const fail = (m: string): never => {
  throw new BadInput(m);
};
const text = (
  v: unknown,
  field: string,
  max: number,
  required = false,
): string | undefined => {
  if (v === undefined || v === null)
    return required ? fail(`Missing ${field}.`) : undefined;
  if (typeof v !== "string" || v.length > max) return fail(`Invalid ${field}.`);
  return v;
};
const id = (v: unknown) => text(v, "id", 200, true) as string;
const int = (v: unknown, lo: number, hi: number, field: string) =>
  typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi
    ? v
    : fail(`Invalid ${field}.`);

export function parseJobSchedule(v: unknown): BestieJobSchedule {
  const s = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  if (s.kind === "once")
    return { kind: "once", dueAt: int(s.dueAt, 0, 4_102_444_800, "time") };
  if (s.kind === "interval")
    return {
      kind: "interval",
      everySeconds: int(s.everySeconds, 60, 366 * 86400, "interval"),
    };
  if (s.kind === "daily")
    return {
      kind: "daily",
      hour: int(s.hour, 0, 23, "hour"),
      minute: int(s.minute, 0, 59, "minute"),
    };
  if (s.kind === "weekly") {
    return {
      kind: "weekly",
      hour: int(s.hour, 0, 23, "hour"),
      minute: int(s.minute, 0, 59, "minute"),
      weekday: int(s.weekday, 0, 6, "weekday"),
    };
  }
  return fail("Invalid schedule.");
}

export function bestieDirectGet(
  scope: BestieListScope,
  kind: AssistantDataKind,
): unknown {
  if (kind === "jobs") return { jobs: getBestieJobState(scope).jobs };
  if (kind === "coffee") {
    const c = getBestieCoffeeState(scope);
    return { entries: c.entries, pendingRun: c.pendingRun, prefs: c.prefs };
  }
  if (kind === "scratch") return { notes: getBestieScratchState(scope).notes };
  const t = getBestieThreadState(scope);
  return { threads: t.threads, pendingSummarize: t.pendingSummarize };
}

export function bestieDirectAct(
  scope: BestieListScope,
  kind: AssistantDataKind,
  action: string,
  p: Record<string, unknown>,
): void {
  const key = `${kind}:${action}`;
  switch (key) {
    case "jobs:add":
      addBestieJobForScope(scope, {
        enabled: p.enabled !== false,
        prompt: text(p.prompt, "prompt", 8000, true) as string,
        schedule: parseJobSchedule(p.schedule),
        title: text(p.title, "title", 200, true) as string,
      });
      return;
    case "jobs:update":
      updateBestieJobForScope(scope, {
        id: id(p.id),
        ...(p.enabled !== undefined ? { enabled: p.enabled === true } : {}),
        ...(p.prompt !== undefined
          ? { prompt: text(p.prompt, "prompt", 8000) }
          : {}),
        ...(p.title !== undefined
          ? { title: text(p.title, "title", 200) }
          : {}),
        ...(p.schedule !== undefined
          ? { schedule: parseJobSchedule(p.schedule) }
          : {}),
      });
      return;
    case "jobs:remove":
      removeBestieJobForScope(scope, id(p.id));
      return;
    case "coffee:brew":
      window.dispatchEvent(new CustomEvent(BESTIE_COFFEE_BREW_EVENT));
      return;
    case "coffee:prefs":
      setBestieCoffeePrefsForScope(scope, {
        hour: int(p.hour, 0, 23, "hour"),
        minute: int(p.minute, 0, 59, "minute"),
      });
      return;
    case "coffee:remove":
      removeBestieCoffeeEntryForScope(scope, id(p.id));
      return;
    case "scratch:add":
      addBestieScratchNoteForScope(scope, {
        body: text(p.body, "body", 50_000) ?? "",
        draft: p.draft === true,
        title: text(p.title, "title", 200) ?? "",
      });
      return;
    case "scratch:update":
      updateBestieScratchNoteForScope(scope, {
        id: id(p.id),
        ...(p.body !== undefined ? { body: text(p.body, "body", 50_000) } : {}),
        ...(p.title !== undefined
          ? { title: text(p.title, "title", 200) }
          : {}),
        ...(p.draft !== undefined ? { draft: p.draft === true } : {}),
      });
      return;
    case "scratch:remove":
      removeBestieScratchNoteForScope(scope, id(p.id));
      return;
    case "threads:remove":
      removeBestieTrackedThreadForScope(scope, id(p.id));
      return;
    case "threads:summarize": {
      const threadId = id(p.id);
      if (!beginBestieThreadSummarizeForScope(scope, threadId))
        fail("A summarize is already running.");
      window.dispatchEvent(
        new CustomEvent(BESTIE_THREAD_SUMMARIZE_EVENT, {
          detail: { threadId },
        }),
      );
      return;
    }
    default:
      fail("Unknown action.");
  }
}

/** Register while the Assistant runs for `scope`; returns the unregister. */
export function registerBestieDirectBackend(
  scope: BestieListScope,
): () => void {
  const backend = {
    relayUrl: scope.relayUrl,
    ownerPubkey: scope.ownerPubkey,
    get: (kind: AssistantDataKind) => bestieDirectGet(scope, kind),
    act: (
      kind: AssistantDataKind,
      action: string,
      payload: Record<string, unknown>,
    ) => bestieDirectAct(scope, kind, action, payload),
  };
  setAssistantDirectBackend(backend);
  return () => setAssistantDirectBackend(null);
}
