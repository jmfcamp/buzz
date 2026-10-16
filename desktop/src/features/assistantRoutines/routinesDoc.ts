// Assistant Routines: named saved actions the user can run from the Assistant (Routines view ▶, or by typing the
// routine's name to the Assistant). Synced like Assistant lists: kind 30078, d=buzz:assistant-routines, NIP-44 to
// self. Pure (no relay / React imports) so it is unit-testable; routinesSync.ts plugs in the relay engine.
//
// Action types are a tagged union so more can be added: give the new type a `type`, a parser branch in
// `parseAction`, a runner branch in routinesRunner.ts and an editor branch in the panel.

export const ASSISTANT_ROUTINES_KIND = 30078;
export const ASSISTANT_ROUTINES_D_TAG = "buzz:assistant-routines";
export const MAX_ROUTINES = 100;
export const MAX_ROUTINE_TEXT = 4_000;
const TOMBSTONE_TTL_S = 60 * 24 * 3600;

export type PostToChannelAction = {
  type: "post-to-channel";
  /** null = use the default target (see defaultWakeChannel). */
  channelId: string | null;
  text: string;
  /** @-mention every bot that is a member of the target channel. */
  mentionChannelBots: boolean;
};
export type AssistantPromptAction = {
  type: "assistant-prompt";
  prompt: string;
};
export type RoutineAction = PostToChannelAction | AssistantPromptAction;
export type RoutineActionType = RoutineAction["type"];

export type RoutineRun = { at: number; ok: boolean; detail: string };
export type Routine = {
  id: string;
  name: string;
  action: RoutineAction;
  builtIn?: boolean;
  lastRun?: RoutineRun;
};
/** `t` = last write (seconds); `on` false = tombstone. Last write wins per id. */
export type RoutineEntry = { on: boolean; t: number; routine?: Routine };
export type RoutinesDoc = { v: 1; routines: Record<string, RoutineEntry> };

export const WAKE_THE_BOTS_ID = "builtin-wake-the-bots";
export const DEFAULT_WAKE_CHANNEL_NAME = "jm-local-agents";
export const WAKE_THE_BOTS: Routine = {
  id: WAKE_THE_BOTS_ID,
  name: "Wake the bots",
  builtIn: true,
  action: {
    type: "post-to-channel",
    channelId: null,
    text: "Wake up! Please reply here to confirm you're online.",
    mentionChannelBots: true,
  },
};

export const emptyRoutinesDoc = (): RoutinesDoc => ({ v: 1, routines: {} });

const str = (v: unknown, max = MAX_ROUTINE_TEXT) =>
  typeof v === "string" ? v.slice(0, max) : null;

function parseAction(v: unknown): RoutineAction | null {
  if (!v || typeof v !== "object") return null;
  const a = v as Record<string, unknown>;
  if (a.type === "post-to-channel") {
    const text = str(a.text);
    if (text === null) return null;
    return {
      type: "post-to-channel",
      channelId: typeof a.channelId === "string" ? a.channelId : null,
      text,
      mentionChannelBots: a.mentionChannelBots === true,
    };
  }
  if (a.type === "assistant-prompt") {
    const prompt = str(a.prompt);
    return prompt === null ? null : { type: "assistant-prompt", prompt };
  }
  return null; // unknown (newer) action type: dropped by this client's parser, kept by newer ones
}

function parseRoutine(v: unknown, id: string): Routine | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  const name = str(r.name, 120)?.trim();
  const action = parseAction(r.action);
  if (!name || !action) return null;
  const out: Routine = { id, name, action };
  if (r.builtIn === true) out.builtIn = true;
  const lr = r.lastRun as Record<string, unknown> | undefined;
  if (lr && typeof lr.at === "number" && typeof lr.ok === "boolean")
    out.lastRun = { at: lr.at, ok: lr.ok, detail: str(lr.detail, 300) ?? "" };
  return out;
}

export function parseRoutinesDoc(json: unknown): RoutinesDoc | null {
  if (!json || typeof json !== "object") return null;
  const d = json as Record<string, unknown>;
  if (d.v !== 1 || !d.routines || typeof d.routines !== "object") return null;
  const routines: Record<string, RoutineEntry> = {};
  for (const [id, raw] of Object.entries(
    d.routines as Record<string, unknown>,
  )) {
    if (!raw || typeof raw !== "object") continue;
    const e = raw as Record<string, unknown>;
    const t = typeof e.t === "number" ? e.t : 0;
    if (e.on === false) {
      routines[id] = { on: false, t };
      continue;
    }
    const routine = parseRoutine(e.routine, id);
    if (routine) routines[id] = { on: true, t, routine };
  }
  return { v: 1, routines };
}

export function mergeRoutinesDoc(a: RoutinesDoc, b: RoutinesDoc): RoutinesDoc {
  const routines: Record<string, RoutineEntry> = { ...a.routines };
  for (const [id, e] of Object.entries(b.routines)) {
    const cur = routines[id];
    // Later write wins; on a tie, a tombstone wins (deterministic either way).
    if (!cur || e.t > cur.t || (e.t === cur.t && !e.on && cur.on))
      routines[id] = e;
  }
  return { v: 1, routines };
}

export function pruneRoutinesDoc(doc: RoutinesDoc, now: number): RoutinesDoc {
  const entries = Object.entries(doc.routines).filter(
    ([, e]) => e.on || now - e.t < TOMBSTONE_TTL_S,
  );
  if (entries.length === Object.keys(doc.routines).length) return doc;
  return { v: 1, routines: Object.fromEntries(entries) };
}

export const sameRoutinesDoc = (a: RoutinesDoc, b: RoutinesDoc) =>
  JSON.stringify(a) === JSON.stringify(b);

/** Routines to show: synced ones plus built-ins the user never edited or deleted. */
export function listRoutines(doc: RoutinesDoc | null): Routine[] {
  const out: Routine[] = [];
  const routines = doc?.routines ?? {};
  for (const e of Object.values(routines))
    if (e.on && e.routine) out.push(e.routine);
  if (!routines[WAKE_THE_BOTS_ID]) out.push(WAKE_THE_BOTS);
  return out.sort(
    (x, y) =>
      Number(!!y.builtIn) - Number(!!x.builtIn) || x.name.localeCompare(y.name),
  );
}

export function upsertRoutine(
  doc: RoutinesDoc,
  routine: Routine,
  now: number,
): RoutinesDoc {
  const prev = doc.routines[routine.id]?.t ?? 0;
  return {
    v: 1,
    routines: {
      ...doc.routines,
      [routine.id]: { on: true, t: Math.max(now, prev + 1), routine },
    },
  };
}

export function deleteRoutine(
  doc: RoutinesDoc,
  id: string,
  now: number,
): RoutinesDoc {
  const prev = doc.routines[id]?.t ?? 0;
  return {
    v: 1,
    routines: {
      ...doc.routines,
      [id]: { on: false, t: Math.max(now, prev + 1) },
    },
  };
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[“”"'’.!?]+/g, "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * "Wake the bots", "run Wake the bots", "please run the routine wake the bots" → that routine.
 * Exact name match only (after the optional run prefix), so normal chat never triggers a routine by accident.
 */
export function matchRoutineInvocation(
  text: string,
  routines: readonly Routine[],
): Routine | null {
  let t = norm(text);
  t = t.replace(
    /^(please |hey |ok )?(run|start|do|play)( the)?( routine)? /,
    "",
  );
  t = t.replace(/ (routine|please|now)$/, "");
  return routines.find((r) => norm(r.name) === t) ?? null;
}

const SECRET_RE =
  /(nsec1[02-9ac-hj-np-z]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY|AKIA[0-9A-Z]{16}|\bsk-[A-Za-z0-9]{20,}|\bghp_[A-Za-z0-9]{20,}|xox[bpa]-[A-Za-z0-9-]{10,}|\b[0-9a-f]{64}\b)/i;

/** Routines sync to the relay: refuse anything that looks like a key or token. */
export function routineSecretProblem(routine: Routine): string | null {
  const a = routine.action;
  const text = a.type === "post-to-channel" ? a.text : a.prompt;
  return SECRET_RE.test(`${routine.name}\n${text}`)
    ? "This looks like a key or token. Routines are synced, so secrets can't be saved in them."
    : null;
}

/** Message body for a post-to-channel run: mentions first, then the text. */
export function composeChannelPost(
  action: PostToChannelAction,
  bots: readonly { pubkey: string; name: string }[],
): { content: string; mentionPubkeys: string[] } {
  const mentioned = action.mentionChannelBots ? bots : [];
  const mentions = mentioned.map((b) => `@${b.name}`).join(" ");
  return {
    content: [mentions, action.text.trim()].filter(Boolean).join(" "),
    mentionPubkeys: [...new Set(mentioned.map((b) => b.pubkey.toLowerCase()))],
  };
}

/** Default channel: the named default if the user is in it, else the joined stream with the most bots. */
export function defaultWakeChannel<C extends { id: string; name: string }>(
  channels: readonly C[],
  botCount?: (c: C) => number,
): C | null {
  const named = channels.find(
    (c) => c.name.toLowerCase() === DEFAULT_WAKE_CHANNEL_NAME,
  );
  if (named) return named;
  if (!botCount) return null;
  let best: C | null = null;
  let n = 0;
  for (const c of channels) {
    const k = botCount(c);
    if (k > n) {
      n = k;
      best = c;
    }
  }
  return best;
}
