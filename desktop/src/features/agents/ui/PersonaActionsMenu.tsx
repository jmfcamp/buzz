import { useDesktopData } from "@/features/bridge/ui/DesktopData";
import {
  CopyPlus,
  EllipsisVertical,
  Pencil,
  Share2,
  Trash2,
} from "lucide-react";

import type { AgentPersona, ManagedAgent } from "@/shared/api/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";

export function PersonaActionsMenu({
  isActionPending,
  isPending,
  persona,
  linkedAgent,
  onDuplicate,
  onEdit,
  onShare,
  onDeactivate: _onDeactivate,
  onDelete,
}: {
  isActionPending: boolean;
  isPending: boolean;
  persona: AgentPersona;
  /** Profile agent instance linked to this definition, if one exists. */
  linkedAgent: ManagedAgent | undefined;
  onDuplicate: (persona: AgentPersona) => void;
  onEdit: (persona: AgentPersona) => void;
  onShare: (
    persona: AgentPersona,
    linkedAgent: ManagedAgent | undefined,
  ) => void;
  onDeactivate: (persona: AgentPersona) => void;
  onDelete: (persona: AgentPersona) => void;
}) {
  // Web without a live Direct connection: the menu still opens (same items as desktop) but the actions need the desktop.
  const { web, live } = useDesktopData();
  const needsDirect = web && !live;
  const disabled = isActionPending || isPending || needsDirect;
  const canEdit = !persona.sourceTeam;

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={`Open actions for ${persona.displayName}`}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          type="button"
        >
          <EllipsisVertical className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        {needsDirect ? (
          <p className="max-w-56 px-2 py-1.5 text-xs text-muted-foreground" data-testid="persona-actions-needs-direct">
            These actions run on your desktop. Connect over Direct to use them.
          </p>
        ) : null}
        {canEdit ? (
          <DropdownMenuItem disabled={disabled} onClick={() => onEdit(persona)}>
            <Pencil className="h-4 w-4" />
            Edit
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          disabled={disabled}
          onClick={() => onDuplicate(persona)}
        >
          <CopyPlus className="h-4 w-4" />
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={disabled}
          onClick={() => onShare(persona, linkedAgent)}
        >
          <Share2 className="h-4 w-4" />
          Share
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {persona.sourceTeam ? (
          <DropdownMenuItem disabled>
            <Trash2 className="h-4 w-4" />
            Managed by team
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            disabled={disabled}
            onClick={() => {
              if (web && !window.confirm(`Delete ${persona.displayName}? This can't be undone.`)) return;
              onDelete(persona);
            }}
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
