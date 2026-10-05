import { ChevronDown } from "lucide-react";
import * as React from "react";

import { useHumanRelayDriOptions } from "@/features/projects/useHumanRelayDriOptions";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { UserAvatar } from "@/shared/ui/UserAvatar";

/** Required DRI picker for the create-project form. Avatar and name, not a native select. */
export function ProjectDriField({
  disabled,
  fieldClassName,
  inputClassName,
  onChange,
  value,
}: {
  disabled: boolean;
  fieldClassName: string;
  inputClassName: string;
  onChange: (pubkey: string) => void;
  value: string;
}) {
  const { failed, options, ready } = useHumanRelayDriOptions();

  React.useEffect(() => {
    if (!ready || !value) return;
    if (!options.some((option) => option.pubkey === value)) onChange("");
  }, [onChange, options, ready, value]);

  const placeholder = failed
    ? "Couldn't load members"
    : ready
      ? "Select a member"
      : "Loading members…";
  const selected = options.find((option) => option.pubkey === value) ?? null;
  const unavailable = disabled || !ready || options.length === 0;

  return (
    <div className="space-y-1.5">
      <label
        className="text-sm font-medium text-foreground"
        htmlFor="create-project-dri"
      >
        Directly responsible individual
      </label>
      <div className={cn("flex min-h-11 items-center px-3", fieldClassName)}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              className={cn(
                "h-8 w-full justify-start gap-2 px-0 text-sm font-normal",
                inputClassName,
                selected && "text-foreground",
              )}
              data-testid="create-project-dri"
              disabled={unavailable}
              id="create-project-dri"
              type="button"
              variant="ghost"
            >
              {selected ? (
                <UserAvatar
                  avatarUrl={selected.avatarUrl}
                  displayName={selected.label}
                  shape="circle"
                  size="xs"
                />
              ) : null}
              <span className="min-w-0 flex-1 truncate text-left">
                {selected ? selected.label : placeholder}
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="max-h-64 w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto"
          >
            {options.map((option) => (
              <DropdownMenuItem
                key={option.pubkey}
                data-testid={`create-project-dri-option-${option.pubkey}`}
                onSelect={() => onChange(option.pubkey)}
              >
                <UserAvatar
                  avatarUrl={option.avatarUrl}
                  displayName={option.label}
                  shape="circle"
                  size="xs"
                />
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
              </DropdownMenuItem>
            ))}
            {!ready && !failed ? (
              <DropdownMenuItem disabled>Loading members…</DropdownMenuItem>
            ) : null}
            {failed ? (
              <DropdownMenuItem disabled>
                Couldn't load members.
              </DropdownMenuItem>
            ) : null}
            {ready && options.length === 0 ? (
              <DropdownMenuItem disabled>
                No community members.
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {ready && options.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No community members are available.
        </p>
      ) : null}
    </div>
  );
}
