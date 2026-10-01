import { Pencil } from "lucide-react";
import * as React from "react";

import { useThreadLabels } from "@/features/sidebar/lib/useThreadLabels";
import { Button } from "@/shared/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";

import { ThreadRenameDialog } from "./ThreadRenameDialog";

type ThreadRenameButtonProps = {
  currentPubkey: string;
  rootId: string;
};

/**
 * Pencil beside the thread title. Saves a local name for this identity.
 * The starred-row menu is the path that also picks an icon.
 */
export function ThreadRenameButton({
  currentPubkey,
  rootId,
}: ThreadRenameButtonProps) {
  const { labelFor, setThreadLabel } = useThreadLabels(currentPubkey);
  const [open, setOpen] = React.useState(false);
  const label = labelFor(rootId);

  return (
    <>
      <Tooltip disableHoverableContent>
        <TooltipTrigger asChild>
          <Button
            aria-label="Rename thread"
            className="size-6 shrink-0"
            data-testid="thread-rename-button"
            onClick={() => setOpen(true)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Pencil aria-hidden className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Rename thread</TooltipContent>
      </Tooltip>
      <ThreadRenameDialog
        allowEmpty
        initialIcon={label?.icon ?? ""}
        initialName={label?.name ?? ""}
        onConfirm={({ name, icon }) => {
          setThreadLabel(rootId, { name, icon });
        }}
        onOpenChange={setOpen}
        open={open}
        showIcon={false}
      />
    </>
  );
}
