import * as React from "react";

import { dueReminderItems } from "@/features/assistantLists/listsDoc";
import {
  completeAssistNipErForItems,
  syncAssistRemindersToNipEr,
} from "@/features/assistantLists/nipErBridge";
import {
  claimReminderFires,
  useAssistantListsDoc,
  useNowSeconds,
} from "@/features/assistantLists/listsStore";
import { readStoredNotificationSettings } from "@/features/notifications/hooks";
import {
  requestDockBounce,
  sendDesktopNotification,
} from "@/features/notifications/lib/desktop";
import {
  playNotificationSound,
  resolveSlotSound,
} from "@/features/notifications/lib/sound";

/**
 * Web/PWA: when Assist list reminders come due while this client is open,
 * fire an OS notification and mark firedAt (so desktop / other devices
 * don't double-fire). Dual-writes to NIP-ER for relay push when closed.
 * No-op inside Tauri (BestieWakeController owns desktop firing).
 */
export function useAssistReminderNotifications(
  pubkey: string | undefined,
): void {
  const isTauri =
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  const doc = useAssistantListsDoc(pubkey);
  const now = useNowSeconds(15_000);
  const firedRef = React.useRef(new Set<string>());

  // Keep NIP-ER dual-write in sync for push when the app is closed.
  React.useEffect(() => {
    if (!pubkey || !doc) return;
    void syncAssistRemindersToNipEr(pubkey);
  }, [pubkey, doc]);

  React.useEffect(() => {
    if (isTauri || !pubkey || !doc) return;
    const due = dueReminderItems(doc, now);
    if (due.length === 0) return;

    const candidates = due.filter(
      (i) => !firedRef.current.has(`${i.id}:${i.dueAt ?? 0}`),
    );
    if (candidates.length === 0) return;

    // claimReminderFires marks firedAt for ids still open+due
    const claimed = claimReminderFires(
      pubkey,
      candidates.map((i) => i.id),
    );
    if (!claimed || claimed.length === 0) return;

    for (const id of claimed) {
      const item = due.find((i) => i.id === id);
      firedRef.current.add(`${id}:${item?.dueAt ?? 0}`);
    }

    const settings = readStoredNotificationSettings(pubkey);
    if (!settings.desktopEnabled || !settings.eventAlertsEnabled.reminder) {
      void completeAssistNipErForItems(pubkey, claimed);
      return;
    }

    const title = claimed.length === 1 ? "Reminder" : "Reminders";
    const body =
      claimed.length === 1
        ? (due.find((i) => i.id === claimed[0])?.text ?? "A reminder is due")
        : claimed
            .map((id) => due.find((i) => i.id === id)?.text)
            .filter(Boolean)
            .join(" · ");

    void sendDesktopNotification({ title, body }).then((didSend) => {
      if (!didSend) return;
      playNotificationSound(resolveSlotSound(settings, "needs_action"));
      void requestDockBounce();
    });
    void completeAssistNipErForItems(pubkey, claimed);
  }, [doc, isTauri, now, pubkey]);
}
