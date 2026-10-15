// Dual-write Assist list reminders to NIP-ER kind 30300 so the relay due
// scheduler can push when desktop is offline. Best-effort: list edits never
// wait on relay publish.
import {
  cancelReminder,
  completeReminder,
  createNoteReminder,
  fetchReminders,
  snoozeReminder,
} from "@/features/reminders/lib/reminderService";
import type { Reminder } from "@/features/reminders/lib/reminderTypes";

import type { ListsDoc } from "./listsDoc";
import { setNipErD } from "./listsOps";
import { getAssistantListsDoc, updateAssistantLists } from "./listsStore";

const inflight = new Set<string>();
const itemLocks = new Set<string>();
let syncTimer: ReturnType<typeof setTimeout> | null = null;

function openAssistReminders(doc: ListsDoc) {
  const out: { id: string; text: string; dueAt: number; nipErD?: string }[] =
    [];
  for (const e of Object.values(doc.items)) {
    if (!e.on || !e.item) continue;
    const i = e.item;
    if (i.kind !== "reminder" || i.status !== "open" || i.dueAt == null)
      continue;
    out.push({
      id: i.id,
      text: i.text,
      dueAt: i.dueAt,
      nipErD: i.nipErD,
    });
  }
  return out;
}

async function findByD(
  pubkey: string,
  dTag: string,
): Promise<Reminder | undefined> {
  const all = await fetchReminders(pubkey);
  return all.find((r) => r.id === dTag);
}

/**
 * Ensure every open Assist reminder with a due time has a matching pending
 * NIP-ER event. Cancels NIP-ER rows when the Assist item is gone or done.
 */
export function syncAssistRemindersToNipEr(
  pubkey: string | undefined,
): void {
  const pk = pubkey?.trim().toLowerCase();
  if (!pk) return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    void syncAssistRemindersToNipErNow(pk);
  }, 1_500);
}

async function syncAssistRemindersToNipErNow(pk: string): Promise<void> {
  const doc = getAssistantListsDoc(pk);
  if (!doc) return;
  const key = `sync:${pk}`;
  if (inflight.has(key)) return;
  inflight.add(key);
  try {
    const open = openAssistReminders(doc);
    const openIds = new Set(open.map((r) => r.id));

    // Create / update
    for (const item of open) {
      const lock = `${pk}:${item.id}`;
      if (itemLocks.has(lock)) continue;
      itemLocks.add(lock);
      try {
        if (!item.nipErD) {
          const ev = await createNoteReminder(item.text, item.dueAt, {
            assistItemId: item.id,
          });
          const dTag = ev.tags.find((t) => t[0] === "d")?.[1];
          if (dTag) {
            updateAssistantLists(pk, (d0, now) =>
              setNipErD(d0, item.id, dTag, now),
            );
          }
        } else {
          const existing = await findByD(pk, item.nipErD);
          if (!existing) {
            const ev = await createNoteReminder(item.text, item.dueAt, {
              assistItemId: item.id,
            });
            const dTag = ev.tags.find((t) => t[0] === "d")?.[1];
            if (dTag) {
              updateAssistantLists(pk, (d0, now) =>
                setNipErD(d0, item.id, dTag, now),
              );
            }
          } else if (
            existing.content.status === "pending" &&
            existing.notBefore != null &&
            existing.notBefore !== item.dueAt
          ) {
            await snoozeReminder(pk, existing, item.dueAt);
          } else if (existing.content.status !== "pending") {
            const ev = await createNoteReminder(item.text, item.dueAt, {
              assistItemId: item.id,
            });
            const dTag = ev.tags.find((t) => t[0] === "d")?.[1];
            if (dTag) {
              updateAssistantLists(pk, (d0, now) =>
                setNipErD(d0, item.id, dTag, now),
              );
            }
          }
        }
      } catch {
        // Best-effort dual-write.
      } finally {
        itemLocks.delete(lock);
      }
    }

    // Cancel NIP-ER for Assist reminders that are no longer open-with-due
    try {
      const all = await fetchReminders(pk);
      for (const rem of all) {
        if (rem.content.source !== "assist-list") continue;
        const assistId = rem.content.assistItemId;
        if (!assistId || openIds.has(assistId)) continue;
        if (rem.content.status === "pending") {
          await cancelReminder(pk, rem).catch(() => undefined);
        }
      }
    } catch {
      // Best-effort.
    }
  } finally {
    inflight.delete(key);
  }
}

/** After Assist wake fires, mark the dual-written NIP-ER done so push/OS don't re-fire. */
export async function completeAssistNipErForItems(
  pubkey: string | undefined,
  itemIds: readonly string[],
): Promise<void> {
  const pk = pubkey?.trim().toLowerCase();
  if (!pk || itemIds.length === 0) return;
  const doc = getAssistantListsDoc(pk);
  if (!doc) return;
  try {
    const all = await fetchReminders(pk);
    for (const id of itemIds) {
      const nipErD = doc.items[id]?.item?.nipErD;
      const rem =
        (nipErD ? all.find((r) => r.id === nipErD) : undefined) ??
        all.find(
          (r) =>
            r.content.source === "assist-list" &&
            r.content.assistItemId === id,
        );
      if (rem && rem.content.status === "pending") {
        await completeReminder(pk, rem).catch(() => undefined);
      }
    }
  } catch {
    // Best-effort.
  }
}
