import { ChevronDown, ListFilter } from "lucide-react";

import type { InboxFilter } from "@/features/home/lib/inbox";
import { cn } from "@/shared/lib/cn";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";

const TRIGGER_CLASS =
  "inline-flex h-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring data-[state=open]:bg-accent data-[state=open]:text-accent-foreground disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 relative w-8 gap-1 px-0 text-sm font-medium sm:w-auto sm:max-w-[8.5rem] sm:px-2";

type InboxFilterMenuProps = {
  filter: InboxFilter;
  onFilterChange: (value: InboxFilter) => void;
  options: ReadonlyArray<{ label: string; value: InboxFilter }>;
};

/** Narrows the active Inbox tab to one of its own item types. */
export function InboxFilterMenu({
  filter,
  onFilterChange,
  options,
}: InboxFilterMenuProps) {
  const activeFilter = options.find((option) => option.value === filter);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={`Filter inbox: ${activeFilter?.label ?? "All"}`}
          className={cn(TRIGGER_CLASS)}
          data-testid="inbox-filter-trigger"
          type="button"
        >
          <ListFilter className="sm:hidden" />
          {activeFilter && activeFilter.value !== "all" ? (
            <span aria-hidden className="absolute right-1 top-1 size-1.5 rounded-full bg-primary sm:hidden" />
          ) : null}
          <span className="hidden truncate sm:inline">{activeFilter?.label ?? "All"}</span>
          <ChevronDown className="hidden text-muted-foreground sm:block" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuRadioGroup
          onValueChange={(value) => onFilterChange(value as InboxFilter)}
          value={filter}
        >
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
