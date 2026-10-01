import { MessageSquare, X } from "lucide-react";
import * as React from "react";

import { EmojiPicker } from "@/features/custom-emoji/ui/EmojiPicker";
import { THREAD_LABEL_NAME_MAX } from "@/features/sidebar/lib/threadLabels";
import { StatusEmoji } from "@/features/user-status/ui/StatusEmoji";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";

export type ThreadRenameDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName: string;
  initialIcon?: string;
  /** Starred-row rename also picks the sidebar icon. The header pencil does not. */
  showIcon: boolean;
  /** Header rename may clear the custom title. A starred row keeps a name. */
  allowEmpty: boolean;
  onConfirm: (value: { name: string; icon: string }) => void;
};

export function ThreadRenameDialog({
  open,
  onOpenChange,
  initialName,
  initialIcon = "",
  showIcon,
  allowEmpty,
  onConfirm,
}: ThreadRenameDialogProps) {
  const [name, setName] = React.useState(initialName);
  const [icon, setIcon] = React.useState(initialIcon);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) {
      setPickerOpen(false);
      return;
    }
    setName(initialName);
    setIcon(initialIcon);
    const timerId = globalThis.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 50);
    return () => globalThis.clearTimeout(timerId);
  }, [open, initialName, initialIcon]);

  const trimmed = name.trim().replace(/\s+/g, " ");
  const unchanged =
    trimmed === initialName.trim() &&
    (!showIcon || icon.trim() === initialIcon.trim());
  const blocked = unchanged || (!allowEmpty && trimmed.length === 0);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blocked) return;
    onConfirm({ name: trimmed, icon: showIcon ? icon.trim() : initialIcon });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" data-testid="thread-rename-dialog">
        <DialogHeader>
          <DialogTitle>Rename thread</DialogTitle>
          <DialogDescription>
            {showIcon
              ? "Choose the name and icon for this starred thread."
              : "Choose the name shown on this thread."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="flex items-center gap-2">
            {showIcon ? (
              <Popover onOpenChange={setPickerOpen} open={pickerOpen}>
                <div className="relative shrink-0">
                  <PopoverTrigger asChild>
                    <button
                      aria-label="Choose thread icon"
                      className="flex h-9 w-9 items-center justify-center rounded-md border border-input text-sm transition-colors hover:bg-accent"
                      data-testid="thread-rename-icon"
                      type="button"
                    >
                      {icon ? (
                        <StatusEmoji
                          className="h-5 w-5"
                          decorative
                          value={icon}
                        />
                      ) : (
                        <MessageSquare aria-hidden className="h-4 w-4" />
                      )}
                    </button>
                  </PopoverTrigger>
                  {icon ? (
                    <button
                      aria-label="Clear thread icon"
                      className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border border-background bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
                      onClick={(event) => {
                        event.stopPropagation();
                        setIcon("");
                      }}
                      type="button"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  ) : null}
                </div>
                <PopoverContent
                  align="start"
                  className="w-auto overflow-hidden rounded-2xl p-0"
                  sideOffset={4}
                >
                  <EmojiPicker
                    onSelect={(selected) => {
                      setIcon(selected);
                      setPickerOpen(false);
                    }}
                  />
                </PopoverContent>
              </Popover>
            ) : null}
            <Input
              aria-label="Thread name"
              autoCapitalize="none"
              autoComplete="off"
              autoCorrect="off"
              className="flex-1"
              data-testid="thread-rename-name"
              maxLength={THREAD_LABEL_NAME_MAX}
              onChange={(event) => setName(event.target.value)}
              placeholder="Thread"
              ref={inputRef}
              spellCheck={false}
              value={name}
            />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button
              data-testid="thread-rename-save"
              disabled={blocked}
              type="submit"
            >
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
