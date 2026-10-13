// Phone only: filters live behind this icon in the header; tapping it shows/hides them as their own row below.
// A small accent dot marks that some filter is active while the row is hidden.
import { ListFilter } from "lucide-react";
import { cn } from "@/shared/lib/cn";

export function PhoneFilterToggle({
  active,
  open,
  onToggle,
  testId,
}: {
  active: boolean;
  open: boolean;
  onToggle: () => void;
  testId: string;
}) {
  return (
    <button
      aria-expanded={open}
      aria-label={open ? "Hide filters" : active ? "Show filters (filters active)" : "Show filters"}
      className={cn(
        "relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground",
        open && "bg-muted text-foreground",
      )}
      data-filter-active={active ? "true" : undefined}
      data-testid={testId}
      onClick={onToggle}
      type="button"
    >
      <ListFilter aria-hidden className="h-4 w-4" />
      {active ? (
        <span aria-hidden className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-primary" data-testid={`${testId}-dot`} />
      ) : null}
    </button>
  );
}
