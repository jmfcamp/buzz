// Apply ```assistant-list``` / ```bestie-list``` fences from agent replies into the synced lists doc.
// Web must do this itself: the desktop Assistant normally applies fences, but phone/web-only sessions
// (and Direct-down) never see them otherwise — the agent can claim success while To-dos stays empty.
import {
  liveItems,
  markProcessed,
  setListItem,
  type ListItem,
  type ListsDoc,
} from "./listsDoc";
import { addItem } from "./listsOps";
import { updateAssistantLists } from "./listsStore";

const FENCE_RE = /```(?:bestie|assistant)-list\s*\r?\n([\s\S]*?)```/gi;

type FenceAdd = {
  op: "add";
  items: Array<{ kind: "todo" | "reminder"; text: string; dueAt?: number | null }>;
};
type FenceIdOp = { op: "complete" | "remove"; id: string };
type FenceAction = FenceAdd | FenceIdOp;

function coerceDueAt(value: unknown): number | null {
  let raw: number | null = null;
  if (typeof value === "number" && Number.isFinite(value)) raw = value;
  else if (typeof value === "string" && value.trim()) {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber) && String(asNumber) === value.trim()) raw = asNumber;
    else {
      const parsed = Date.parse(value);
      if (Number.isFinite(parsed)) return Math.floor(parsed / 1000);
    }
  }
  if (raw == null || !Number.isFinite(raw) || raw < 0) return null;
  if (raw >= 1_000_000_000_000) return Math.floor(raw / 1000);
  return Math.floor(raw);
}

function parsePayload(value: unknown): FenceAction[] {
  const payloads = Array.isArray(value) ? value : [value];
  const actions: FenceAction[] = [];
  for (const payload of payloads) {
    if (typeof payload !== "object" || payload === null) continue;
    const record = payload as Record<string, unknown>;
    if (record.op === "add" && Array.isArray(record.items)) {
      const items: FenceAdd["items"] = [];
      for (const entry of record.items) {
        if (typeof entry !== "object" || entry === null) continue;
        const e = entry as Record<string, unknown>;
        if ((e.kind !== "todo" && e.kind !== "reminder") || typeof e.text !== "string") continue;
        const text = e.text.trim();
        if (!text) continue;
        items.push({
          kind: e.kind,
          text,
          dueAt: e.kind === "reminder" ? coerceDueAt(e.dueAt) : null,
        });
      }
      if (items.length) actions.push({ op: "add", items });
      continue;
    }
    if (
      (record.op === "complete" || record.op === "remove") &&
      typeof record.id === "string" &&
      record.id.trim()
    ) {
      actions.push({ op: record.op, id: record.id.trim() });
    }
  }
  return actions;
}

export function parseAssistantListFences(content: string): FenceAction[] {
  const actions: FenceAction[] = [];
  for (const match of content.matchAll(FENCE_RE)) {
    try {
      actions.push(...parsePayload(JSON.parse(match[1] ?? "")));
    } catch {
      /* ignore malformed fence */
    }
  }
  if (actions.length) return actions;
  const trimmed = content.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const json = JSON.parse(trimmed) as unknown;
      if (
        json &&
        typeof json === "object" &&
        ("op" in (json as object) || Array.isArray(json))
      ) {
        return parsePayload(json);
      }
    } catch {
      /* not JSON */
    }
  }
  return actions;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

function alreadyHasOpen(doc: ListsDoc, kind: "todo" | "reminder", text: string): boolean {
  const t = norm(text);
  return liveItems(doc).some(
    (i) => i.status === "open" && i.kind === kind && norm(i.text) === t,
  );
}

/**
 * Apply list fences from one agent message. Idempotent via `processed[messageId]`.
 * Returns how many mutations were made.
 */
/** When the agent claims an add in prose but omitted the fence (common), recover the text as a todo. */
export function parseAssistantListClaims(content: string): FenceAction[] {
  const items: FenceAdd["items"] = [];
  const re =
    /(?:Added|Adding)\s+["']([^"']+)["']\s+to your Assistant List/gi;
  for (const match of content.matchAll(re)) {
    const text = (match[1] ?? "").trim();
    if (text) items.push({ kind: "todo", text });
  }
  return items.length ? [{ op: "add", items }] : [];
}

export function applyAssistantListFencesFromMessage(
  me: string | undefined,
  messageId: string,
  content: string,
): number {
  const actions = parseAssistantListFences(content);
  const claims = actions.length ? [] : parseAssistantListClaims(content);
  const all = actions.length ? actions : claims;
  if (!all.length || !me || !messageId) return 0;
  let applied = 0;
  updateAssistantLists(me, (doc, now) => {
    if (messageId in doc.processed) return doc;
    let next = doc;
    for (const action of all) {
      if (action.op === "add") {
        for (const it of action.items) {
          if (alreadyHasOpen(next, it.kind, it.text)) continue;
          const before = next;
          next = addItem(next, now, {
            kind: it.kind,
            text: it.text,
            dueAt: it.dueAt ?? null,
          });
          if (next !== before) applied += 1;
        }
      } else {
        const cur = next.items[action.id];
        if (!cur?.on || !cur.item) continue;
        const item: ListItem = cur.item;
        next =
          action.op === "remove"
            ? setListItem(next, action.id, null, now)
            : setListItem(
                next,
                action.id,
                { ...item, status: "done", updatedAt: now },
                now,
              );
        applied += 1;
      }
    }
    if (applied === 0 && all.length) {
      // Still mark processed so we don't keep re-parsing a no-op / duplicate fence.
      return markProcessed(next, [messageId], now);
    }
    if (applied === 0) return doc;
    return markProcessed(next, [messageId], now);
  });
  return applied;
}
