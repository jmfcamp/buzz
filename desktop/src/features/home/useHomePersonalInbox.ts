import { useAssistantDueReminderCount } from "@/features/assistantLists/listsStore";
import * as React from "react";

import { useHomeDrafts } from "@/features/home/useHomeDrafts";
import { useRemindersQuery } from "@/features/reminders/hooks";
import {
  countDueInboxReminders,
  groupReminders,
  inboxMessageReminders,
} from "@/features/reminders/lib/reminderFilters";

type UseHomePersonalInboxOptions = {
  allowMixedSelection: boolean;
  currentPubkey?: string;
  isDrafts: boolean;
  isNarrowHomeViewport: boolean;
  isReminders: boolean;
  viewportWidthPx: number;
};

export function useHomePersonalInbox({
  allowMixedSelection,
  currentPubkey,
  isDrafts,
  isNarrowHomeViewport,
  isReminders,
  viewportWidthPx,
}: UseHomePersonalInboxOptions) {
  const remindersQuery = useRemindersQuery(currentPubkey);
  const assistantDueCount = useAssistantDueReminderCount(currentPubkey);
  // Same rule as the shared Inbox badge (useInboxTabCounts): the Assistant's reminders count once, from its lists
  // doc, not again through their hidden NIP-ER copies.
  const dueReminderCount =
    countDueInboxReminders(remindersQuery.data ?? []) + assistantDueCount;
  // Exactly what RemindersPanel lists (it hides the Assistant Lists' copies).
  const pendingReminders = React.useMemo(
    () =>
      groupReminders(inboxMessageReminders(remindersQuery.data ?? [])).flatMap(
        (group) => group.reminders,
      ),
    [remindersQuery.data],
  );
  const [selectedReminderId, selectReminder] = React.useState<string | null>(
    null,
  );
  const selectedReminder =
    pendingReminders.find((reminder) => reminder.id === selectedReminderId) ??
    null;

  React.useEffect(() => {
    const selectionEnabled = isReminders || allowMixedSelection;
    if (!selectionEnabled) {
      selectReminder(null);
      return;
    }
    if (
      selectedReminderId !== null &&
      !pendingReminders.some((reminder) => reminder.id === selectedReminderId)
    ) {
      selectReminder(null);
      return;
    }
    if (!isReminders) return;
    if (viewportWidthPx === 0 || selectedReminder !== null) return;
    selectReminder(
      isNarrowHomeViewport ? null : (pendingReminders[0]?.id ?? null),
    );
  }, [
    allowMixedSelection,
    isNarrowHomeViewport,
    isReminders,
    pendingReminders,
    selectedReminderId,
    selectedReminder,
    viewportWidthPx,
  ]);

  // Drafts are only listed (and selectable) under the dedicated Drafts
  // filter — they never appear in the mixed All view.
  const drafts = useHomeDrafts({
    autoSelect: isDrafts,
    isNarrowHomeViewport,
    selectionEnabled: isDrafts,
    viewportWidthPx,
  });

  return {
    drafts,
    dueReminderCount,
    pendingReminders,
    reminders: {
      selectedId: selectedReminderId,
      selectedItem: selectedReminder,
      select: selectReminder,
    },
  };
}
