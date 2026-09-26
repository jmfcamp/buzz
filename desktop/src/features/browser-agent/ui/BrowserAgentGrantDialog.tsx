import * as React from "react";

import { useManagedAgentsQuery } from "@/features/agents/hooks";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";

import type { BrowserAgentMode } from "../lib/types";

export type BrowserAgentGrantPick = {
  agentId: string;
  agentPubkey: string;
  agentName: string;
  channelId: string;
  threadRoot?: string | null;
  mode: BrowserAgentMode;
};

export function BrowserAgentGrantDialog({
  channelId,
  mode,
  onOpenChange,
  onPick,
  open,
  threadRoot,
}: {
  channelId: string;
  mode: BrowserAgentMode;
  onOpenChange: (open: boolean) => void;
  onPick: (pick: BrowserAgentGrantPick) => void;
  open: boolean;
  threadRoot?: string | null;
}) {
  const agentsQuery = useManagedAgentsQuery({ enabled: open });
  const agents = agentsQuery.data ?? [];
  const [pubkey, setPubkey] = React.useState("");
  const [channel, setChannel] = React.useState(channelId);
  const [thread, setThread] = React.useState(threadRoot ?? "");

  React.useEffect(() => {
    if (!open) return;
    setChannel(channelId);
    setThread(threadRoot ?? "");
    setPubkey("");
  }, [open, channelId, threadRoot]);

  const selected = agents.find((a) => a.pubkey === pubkey) ?? null;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent data-testid="browser-agent-grant-dialog">
        <DialogHeader>
          <DialogTitle>
            {mode === "drive" ? "Let agent drive" : "Watch with agent"}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Agent</span>
            <select
              className="rounded-md border border-border bg-background px-2 py-1.5"
              data-testid="browser-agent-grant-agent"
              onChange={(e) => setPubkey(e.target.value)}
              value={pubkey}
            >
              <option value="">Select agent…</option>
              {agents.map((agent) => (
                <option key={agent.pubkey} value={agent.pubkey}>
                  {agent.name || agent.pubkey.slice(0, 12)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Channel id</span>
            <input
              className="rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs"
              data-testid="browser-agent-grant-channel"
              onChange={(e) => setChannel(e.target.value)}
              value={channel}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Thread root (optional)</span>
            <input
              className="rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs"
              data-testid="browser-agent-grant-thread"
              onChange={(e) => setThread(e.target.value)}
              value={thread}
            />
          </label>
        </div>
        <DialogFooter>
          <Button
            onClick={() => onOpenChange(false)}
            type="button"
            variant="ghost"
          >
            Cancel
          </Button>
          <Button
            data-testid="browser-agent-grant-confirm"
            disabled={!selected || !channel.trim()}
            onClick={() => {
              if (!selected) return;
              onPick({
                agentId: selected.pubkey,
                agentPubkey: selected.pubkey,
                agentName: selected.name || selected.pubkey.slice(0, 12),
                channelId: channel.trim(),
                threadRoot: thread.trim() || null,
                mode,
              });
              onOpenChange(false);
            }}
            type="button"
          >
            Grant {mode === "drive" ? "Drive" : "Observe"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
