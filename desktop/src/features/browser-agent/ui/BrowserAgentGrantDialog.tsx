import * as React from "react";

import { useManagedAgentsQuery } from "@/features/agents/hooks";
import {
  playgroundConversationFromPopout,
  playgroundPinScopeKey,
} from "@/features/playground/lib/conversation";
import { pinPlaygroundToConversation } from "@/features/playground/lib/conversationPins";
import type { PlaygroundCard } from "@/features/playground/lib/types";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";

import {
  filterActiveLocalManagedAgents,
  NO_RUNNING_LOCAL_AGENTS_LABEL,
} from "../lib/grantAgentRoster";
import { parseGrantConversationLink } from "../lib/parseGrantConversationLink";
import type { BrowserAgentMode } from "../lib/types";

export type BrowserAgentGrantPick = {
  agentId: string;
  agentPubkey: string;
  agentName: string;
  channelId: string;
  threadRoot?: string | null;
  mode: BrowserAgentMode;
  pinnedToConversation?: boolean;
};

export function BrowserAgentGrantDialog({
  channelId = "",
  mode: initialMode,
  onOpenChange,
  onPick,
  open,
  playgroundCard = null,
  threadRoot = null,
}: {
  channelId?: string;
  mode: BrowserAgentMode;
  onOpenChange: (open: boolean) => void;
  onPick: (pick: BrowserAgentGrantPick) => void;
  open: boolean;
  /** When set, offer pin-to-conversation using existing playground pin store. */
  playgroundCard?: PlaygroundCard | null;
  threadRoot?: string | null;
}) {
  const agentsQuery = useManagedAgentsQuery({ enabled: open });
  const agents = React.useMemo(
    () => filterActiveLocalManagedAgents(agentsQuery.data ?? []),
    [agentsQuery.data],
  );
  const [pubkey, setPubkey] = React.useState("");
  const [rawAgent, setRawAgent] = React.useState("");
  const [link, setLink] = React.useState("");
  const [linkError, setLinkError] = React.useState<string | null>(null);
  const [channel, setChannel] = React.useState(channelId);
  const [thread, setThread] = React.useState(threadRoot ?? "");
  const [advancedOpen, setAdvancedOpen] = React.useState(false);
  const [mode, setMode] = React.useState<BrowserAgentMode>(initialMode);
  const [pinToConversation, setPinToConversation] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setChannel(channelId);
    setThread(threadRoot ?? "");
    setPubkey("");
    setRawAgent("");
    setLink("");
    setLinkError(null);
    setAdvancedOpen(false);
    setMode(initialMode);
    setPinToConversation(false);
  }, [open, channelId, threadRoot, initialMode]);

  React.useEffect(() => {
    if (pubkey && !agents.some((a) => a.pubkey === pubkey)) {
      setPubkey("");
    }
  }, [agents, pubkey]);

  const selected = agents.find((a) => a.pubkey === pubkey) ?? null;
  const advancedPubkey = rawAgent.trim();
  const effectivePubkey = selected?.pubkey ?? advancedPubkey;
  const effectiveName =
    selected?.name ||
    agents.find((a) => a.pubkey === advancedPubkey)?.name ||
    (effectivePubkey ? effectivePubkey.slice(0, 12) : "");

  function applyLink(value: string) {
    setLink(value);
    const parsed = parseGrantConversationLink(value);
    if (!value.trim()) {
      setLinkError(null);
      return;
    }
    if (!parsed) {
      setLinkError("Paste a Buzz channel or thread link.");
      return;
    }
    setLinkError(null);
    setChannel(parsed.channelId);
    setThread(parsed.threadRoot ?? "");
  }

  const canConfirm = Boolean(effectivePubkey && channel.trim());

  function handleConfirm() {
    if (!effectivePubkey || !channel.trim()) return;
    const nextChannel = channel.trim();
    const nextThread = thread.trim() || null;
    let pinnedToConversation = false;
    if (pinToConversation && playgroundCard) {
      const conversation = playgroundConversationFromPopout({
        channelId: nextChannel,
        threadId: nextThread,
      });
      if (conversation) {
        pinPlaygroundToConversation(
          playgroundPinScopeKey(conversation),
          playgroundCard,
          nextChannel,
        );
        pinnedToConversation = true;
      }
    }
    onPick({
      agentId: effectivePubkey,
      agentPubkey: effectivePubkey,
      agentName: effectiveName || effectivePubkey.slice(0, 12),
      channelId: nextChannel,
      threadRoot: nextThread,
      mode,
      pinnedToConversation,
    });
    onOpenChange(false);
  }

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
            {agents.length === 0 ? (
              <p
                className="rounded-md border border-dashed border-border px-2 py-1.5 text-sm text-muted-foreground"
                data-testid="browser-agent-grant-agent-empty"
              >
                {NO_RUNNING_LOCAL_AGENTS_LABEL}
              </p>
            ) : (
              <select
                className="rounded-md border border-border bg-background px-2 py-1.5"
                data-testid="browser-agent-grant-agent"
                onChange={(e) => {
                  setPubkey(e.target.value);
                  if (e.target.value) setRawAgent("");
                }}
                value={pubkey}
              >
                <option value="">Select agent…</option>
                {agents.map((agent) => (
                  <option key={agent.pubkey} value={agent.pubkey}>
                    {agent.name || agent.pubkey.slice(0, 12)}
                  </option>
                ))}
              </select>
            )}
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">
              Channel or thread link
            </span>
            <input
              className="rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs"
              data-testid="browser-agent-grant-link"
              onChange={(e) => applyLink(e.target.value)}
              placeholder="hulabuzz://message?… or channel link"
              value={link}
            />
            {linkError ? (
              <span className="text-2xs text-destructive">{linkError}</span>
            ) : null}
            {channel.trim() ? (
              <span
                className="truncate text-2xs text-muted-foreground"
                data-testid="browser-agent-grant-link-preview"
              >
                Bound to {channel.trim()}
                {thread.trim() ? ` · thread ${thread.trim().slice(0, 12)}…` : ""}
              </span>
            ) : null}
          </label>

          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Mode</span>
            <Button
              aria-pressed={mode === "observe"}
              data-testid="browser-agent-grant-mode-observe"
              onClick={() => setMode("observe")}
              size="xs"
              type="button"
              variant={mode === "observe" ? "secondary" : "ghost"}
            >
              Observe
            </Button>
            <Button
              aria-pressed={mode === "drive"}
              data-testid="browser-agent-grant-mode-drive"
              onClick={() => setMode("drive")}
              size="xs"
              type="button"
              variant={mode === "drive" ? "secondary" : "ghost"}
            >
              Drive
            </Button>
          </div>

          {playgroundCard ? (
            <label className="flex items-center gap-2 text-sm">
              <input
                checked={pinToConversation}
                data-testid="browser-agent-grant-pin-conversation"
                onChange={(e) => setPinToConversation(e.target.checked)}
                type="checkbox"
              />
              <span>Pin this browser to that channel/thread</span>
            </label>
          ) : null}

          <div>
            <button
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              data-testid="browser-agent-grant-advanced-toggle"
              onClick={() => setAdvancedOpen((value) => !value)}
              type="button"
            >
              {advancedOpen ? "Hide advanced" : "Advanced"}
            </button>
            {advancedOpen ? (
              <div
                className="mt-2 flex flex-col gap-2"
                data-testid="browser-agent-grant-advanced"
              >
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-muted-foreground">
                    Agent pubkey / id
                  </span>
                  <input
                    className="rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs"
                    data-testid="browser-agent-grant-raw-agent"
                    onChange={(e) => {
                      setRawAgent(e.target.value);
                      if (e.target.value.trim()) setPubkey("");
                    }}
                    value={rawAgent}
                  />
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
                  <span className="text-muted-foreground">
                    Thread root (optional)
                  </span>
                  <input
                    className="rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs"
                    data-testid="browser-agent-grant-thread"
                    onChange={(e) => setThread(e.target.value)}
                    value={thread}
                  />
                </label>
              </div>
            ) : null}
          </div>
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
            disabled={!canConfirm}
            onClick={handleConfirm}
            type="button"
          >
            Grant {mode === "drive" ? "Drive" : "Observe"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
