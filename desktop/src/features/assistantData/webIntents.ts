// Typed requests in the web Assist composer ("remind me to … at 3pm", "done with …", "remove …") applied on
// the web right away, against the synced lists doc. The message id is recorded as processed, so the desktop (which also
// watches your messages to the Assistant) does not apply it a second time. Everything else (am/pm confirms, jobs,
// scratch, coffee) is left to the desktop, which applies your messages to the Assistant as before.
import {
  liveItems,
  markProcessed,
  setListItem,
  type ListItem,
  type ListsDoc,
} from "@/features/assistantLists/listsDoc";
import { addItem } from "@/features/assistantLists/listsOps";
import { updateAssistantLists } from "@/features/assistantLists/listsStore";

import { parseBestieUserListIntent } from "./core/parseBestieUserListIntent";

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

function findMatch(
  doc: ListsDoc,
  text: string,
  kind?: string,
): ListItem | null {
  const t = norm(text);
  const open = liveItems(doc).filter(
    (i) => i.status === "open" && (!kind || i.kind === kind),
  );
  return (
    open.find((i) => norm(i.text) === t) ??
    open.find((i) => norm(i.text).includes(t)) ??
    null
  );
}

/** Apply what we can of `content` on the web; returns how many changes were made. */
export function applyWebUserIntents(
  me: string | undefined,
  messageId: string,
  content: string,
  nowMs = Date.now(),
): number {
  let applied = 0;
  const intent = parseBestieUserListIntent(content, nowMs);
  updateAssistantLists(me, (doc, now) => {
    if (messageId in doc.processed) return doc;
    let next = doc;
    if (intent?.op === "add") {
      for (const it of intent.items) {
        const before = next;
        next = addItem(next, now, {
          kind: it.kind,
          text: it.text,
          dueAt: it.dueAt ?? null,
          repeat: it.repeat ?? null,
        });
        if (next !== before) applied += 1;
      }
    } else if (
      intent?.op === "complete-match" ||
      intent?.op === "remove-match"
    ) {
      const hit = findMatch(next, intent.text, intent.kind);
      if (hit) {
        next =
          intent.op === "remove-match"
            ? setListItem(next, hit.id, null, now)
            : setListItem(
                next,
                hit.id,
                { ...hit, status: "done", updatedAt: now },
                now,
              );
        applied += 1;
      }
    } else {
      // Nothing for lists (or needs am/pm confirm): leave the message for the desktop.
      return doc;
    }
    return markProcessed(next, [messageId], now);
  });

  return applied;
}
