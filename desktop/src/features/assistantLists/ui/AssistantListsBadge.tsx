import { useAssistantDueReminderCount } from "@/features/assistantLists/listsStore";
import { cn } from "@/shared/lib/cn";

/**
 * The Assistant Lists badge (due reminders) on an assistant launcher: same count and colour as the Lists tab badge,
 * placed like the phone tab bar's Inbox badge. Renders nothing at 0, so it clears with the Lists badge.
 */
export function AssistantListsBadge({
  className,
  me,
  testId,
}: {
  className?: string;
  me: string | undefined;
  testId: string;
}) {
  const count = useAssistantDueReminderCount(me);
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "pointer-events-none absolute -right-2.5 -top-1 min-w-[1.1rem] rounded-full bg-destructive px-1 text-center text-[10px] font-semibold leading-[1.1rem] text-destructive-foreground tabular-nums",
        className,
      )}
      data-testid={testId}
    >
      {count > 99 ? "99+" : count}
      <span className="sr-only"> due on your Assistant's lists</span>
    </span>
  );
}
