import { SquareTerminal } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import {
  useAcpRuntimesQuery,
  useManagedAgentsQuery,
} from "@/features/agents/hooks";
import {
  buildProjectBuzzTermPrompt,
  filterProjectBuzzTermAgents,
  projectBuzzTermAgentEmptyLabel,
  projectBuzzTermLaunchAllowed,
  type ProjectBuzzTermPlace,
} from "@/features/projects/lib/projectBuzzTermHandoff";
import { openTermSessionCard } from "@/features/term-session/lib/openCard";
import { rememberTermSessionPrompt } from "@/features/term-session/lib/promptStore";
import { listTermSessionHarnesses } from "@/features/term-session/lib/harnesses";
import {
  TERM_SESSION_HULA,
  TERM_SESSION_VERSION,
  type TermSessionCard,
  type TermSessionTool,
} from "@/features/term-session/lib/types";
import { normalizePubkey } from "@/shared/lib/pubkey";
import { Button } from "@/shared/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";

import { PROJECT_CONTEXT_ACTION_BUTTON_CLASS } from "./projectContextActionStyles";

export function ProjectBuzzTermButton({
  channelId,
  channelName,
  checkedOutBranch,
  localCwd,
  openClawPath,
  place,
  selectedTag,
  viewedBranch,
}: {
  channelId: string | null;
  channelName: string;
  checkedOutBranch?: string | null;
  localCwd?: string | null;
  openClawPath?: string | null;
  place: ProjectBuzzTermPlace;
  selectedTag?: string | null;
  viewedBranch?: string | null;
}) {
  const openClaw = Boolean(openClawPath?.trim());
  const launch = projectBuzzTermLaunchAllowed({
    openClaw,
    viewedBranch,
    checkedOutBranch,
    selectedTag,
  });
  const [open, setOpen] = React.useState(false);
  const [agentPubkey, setAgentPubkey] = React.useState("");
  const [harness, setHarness] = React.useState<TermSessionTool>("claude");
  const [busy, setBusy] = React.useState(false);
  const agentLabelId = React.useId();

  const agentsQuery = useManagedAgentsQuery({
    enabled: open && launch.allowed,
  });
  const runtimesQuery = useAcpRuntimesQuery({
    enabled: open && launch.allowed,
  });

  const agents = React.useMemo(
    () => filterProjectBuzzTermAgents(agentsQuery.data ?? [], openClaw),
    [agentsQuery.data, openClaw],
  );
  const harnesses = React.useMemo(
    () => listTermSessionHarnesses(runtimesQuery.data ?? []),
    [runtimesQuery.data],
  );

  React.useEffect(() => {
    if (!open) return;
    setAgentPubkey("");
    setHarness(harnesses.find((option) => option.available)?.id ?? "claude");
  }, [open, harnesses]);

  React.useEffect(() => {
    if (!launch.allowed) setOpen(false);
  }, [launch.allowed]);

  React.useEffect(() => {
    if (
      agentPubkey &&
      !agents.some(
        (agent) =>
          normalizePubkey(agent.pubkey) === normalizePubkey(agentPubkey),
      )
    ) {
      setAgentPubkey("");
    }
  }, [agents, agentPubkey]);

  const selectedAgent =
    agents.find(
      (agent) => normalizePubkey(agent.pubkey) === normalizePubkey(agentPubkey),
    ) ?? null;
  const selectedHarness =
    harnesses.find((option) => option.id === harness) ?? null;
  const canGo =
    launch.allowed &&
    Boolean(selectedAgent) &&
    Boolean(selectedHarness?.available) &&
    !busy;

  async function handleGo() {
    if (!selectedAgent || !selectedHarness?.available || !launch.allowed) {
      return;
    }
    const handoffChannelId = channelId?.trim() ?? "";
    if (!handoffChannelId) {
      toast.error("This project has no channel for Buzz Term.");
      return;
    }
    setBusy(true);
    try {
      const prompt = buildProjectBuzzTermPrompt(
        {
          ...place,
          branch: viewedBranch?.trim() || place.branch,
          openClawPath,
        },
        {
          name: selectedAgent.name.trim() || selectedAgent.pubkey.slice(0, 12),
          pubkey: selectedAgent.pubkey,
        },
      );
      const sid = crypto.randomUUID();
      rememberTermSessionPrompt(sid, prompt);
      const cwd = openClaw ? null : localCwd?.trim();
      const card: TermSessionCard = {
        hula: TERM_SESSION_HULA,
        v: TERM_SESSION_VERSION,
        name: `${place.projectName} ${place.view}`.trim() || "Project",
        tool: harness,
        sid,
        prompt,
        ...(cwd && (cwd.startsWith("/") || cwd.startsWith("~")) ? { cwd } : {}),
        ...(openClaw ? { openclawWorkspace: true } : {}),
      };
      await openTermSessionCard(card, {
        channelId: handoffChannelId,
        channelName: channelName.trim() || place.repositoryName,
        threadId: null,
      });
      setOpen(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not open Buzz Term.",
      );
    } finally {
      setBusy(false);
    }
  }

  const trigger = (
    <Button
      aria-label={launch.allowed ? "Buzz Term" : launch.title}
      className={PROJECT_CONTEXT_ACTION_BUTTON_CLASS}
      data-testid="project-buzz-term"
      disabled={!launch.allowed}
      size="sm"
      title={launch.title}
      type="button"
      variant="ghost"
    >
      <SquareTerminal className="h-3.5 w-3.5" />
      Buzz Term
    </Button>
  );

  if (!launch.allowed) return trigger;

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 max-w-[90vw] space-y-3"
        data-testid="project-buzz-term-panel"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div>
          <div className="text-sm font-semibold">
            Open this place in Buzz Term
          </div>
          <p className="mt-0.5 text-2xs text-muted-foreground">
            {openClaw
              ? "Pick a local agent with OpenClaw and a harness."
              : "Pick a local agent and a harness."}
          </p>
        </div>
        <div className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground" id={agentLabelId}>
            Agent
          </span>
          {agentsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading agents…</p>
          ) : agents.length === 0 ? (
            <p
              className="rounded-md border border-dashed border-border px-2 py-1.5 text-sm text-muted-foreground"
              data-testid="project-buzz-term-agent-empty"
            >
              {projectBuzzTermAgentEmptyLabel(openClaw)}
            </p>
          ) : (
            <select
              aria-labelledby={agentLabelId}
              className="rounded-md border border-border bg-background px-2 py-1.5"
              data-testid="project-buzz-term-agent"
              onChange={(event) => setAgentPubkey(event.target.value)}
              value={agentPubkey}
            >
              <option value="">Select agent…</option>
              {agents.map((agent) => (
                <option key={agent.pubkey} value={agent.pubkey}>
                  {agent.name || agent.pubkey.slice(0, 12)}
                </option>
              ))}
            </select>
          )}
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Harness</span>
          <select
            className="rounded-md border border-border bg-background px-2 py-1.5"
            data-testid="project-buzz-term-harness"
            onChange={(event) =>
              setHarness(event.target.value as TermSessionTool)
            }
            value={harness}
          >
            {harnesses.map((option) => (
              <option
                disabled={!option.available}
                key={option.id}
                value={option.id}
              >
                {option.label}
                {option.available ? "" : " (not installed)"}
              </option>
            ))}
          </select>
          {selectedHarness && !selectedHarness.available ? (
            <span className="text-2xs text-muted-foreground">
              {selectedHarness.installHint}
            </span>
          ) : null}
        </label>
        <div className="flex justify-end">
          <Button
            data-testid="project-buzz-term-go"
            disabled={!canGo}
            onClick={() => void handleGo()}
            size="sm"
            type="button"
          >
            {busy ? "Working…" : "Go"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
