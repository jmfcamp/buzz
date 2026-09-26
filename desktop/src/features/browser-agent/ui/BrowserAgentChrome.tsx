import { Eye, Hand, MousePointer2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/shared/ui/button";

import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  clearBrowserAgentGrant,
  getBrowserAgentGrant,
  setBrowserAgentGrant,
  subscribeBrowserAgentGrant,
  takeBrowserAgentControl,
} from "../lib/api";
import { browserWebviewLabel } from "../lib/labels";
import type { BrowserAgentGrant, BrowserAgentMode, BrowserAgentSurface } from "../lib/types";
import {
  BrowserAgentGrantDialog,
  type BrowserAgentGrantPick,
} from "./BrowserAgentGrantDialog";

export function BrowserAgentChrome({
  channelId,
  prefillAgent,
  surface,
  surfaceId,
  threadRoot,
}: {
  channelId?: string | null;
  prefillAgent?: { agentId: string; agentPubkey: string } | null;
  surface: BrowserAgentSurface;
  surfaceId: string;
  threadRoot?: string | null;
}) {
  const webviewLabel = browserWebviewLabel({ surface, surfaceId });
  const [grant, setGrant] = React.useState<BrowserAgentGrant | null>(null);
  const [dialogMode, setDialogMode] = React.useState<BrowserAgentMode | null>(
    null,
  );
  const [busy, setBusy] = React.useState(false);


  React.useEffect(() => {
    if (!grant || grant.mode !== "drive") return;
    if (!isTauri() && import.meta.env.MODE !== "e2e") return;
    const timer = window.setInterval(() => {
      void invoke("browser_agent_process_drive_inbox", {
        webviewLabel,
      }).catch(() => {});
    }, 750);
    return () => window.clearInterval(timer);
  }, [grant, webviewLabel]);

  React.useEffect(() => {
    let cancelled = false;
    void getBrowserAgentGrant(webviewLabel).then((next) => {
      if (!cancelled) setGrant(next);
    });
    const unlisten = subscribeBrowserAgentGrant((payload) => {
      if (payload.webviewLabel !== webviewLabel) return;
      setGrant(payload.grant);
    });
    return () => {
      cancelled = true;
      void unlisten.then((stop) => stop());
    };
  }, [webviewLabel]);

  async function applyMode(mode: BrowserAgentMode | "off") {
    if (busy) return;
    if (mode === "off") {
      setBusy(true);
      try {
        await clearBrowserAgentGrant(webviewLabel);
        setGrant(null);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not clear grant.");
      } finally {
        setBusy(false);
      }
      return;
    }
    if (prefillAgent && channelId) {
      await commitGrant({
        agentId: prefillAgent.agentId,
        agentPubkey: prefillAgent.agentPubkey,
        agentName: prefillAgent.agentPubkey.slice(0, 12),
        channelId,
        threadRoot: threadRoot ?? null,
        mode,
      });
      return;
    }
    setDialogMode(mode);
  }

  async function commitGrant(pick: BrowserAgentGrantPick, allowReplace = false) {
    setBusy(true);
    try {
      const next = await setBrowserAgentGrant({
        surface,
        surfaceId,
        agentId: pick.agentId,
        agentPubkey: pick.agentPubkey,
        channelId: pick.channelId,
        threadRoot: pick.threadRoot,
        mode: pick.mode,
        allowReplace,
      });
      setGrant(next);
      toast.success(
        pick.mode === "drive"
          ? `Drive granted to ${pick.agentName}`
          : `Observe granted to ${pick.agentName}`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not set grant.";
      if (message.includes("confirm replace")) {
        if (window.confirm("Replace the current agent grant on this browser?")) {
          await commitGrant(pick, true);
        }
      } else {
        toast.error(message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleTakeControl() {
    setBusy(true);
    try {
      await takeBrowserAgentControl(webviewLabel);
      setGrant(null);
      toast.message("You have control");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not take control.",
      );
    } finally {
      setBusy(false);
    }
  }

  const mode: BrowserAgentMode | "off" = grant?.mode ?? "off";

  return (
    <div
      className="flex min-w-0 items-center gap-1"
      data-testid="browser-agent-chrome"
    >
      <ModeChip
        active={mode === "off"}
        disabled={busy}
        label="Off"
        onClick={() => void applyMode("off")}
        testId="browser-agent-mode-off"
      />
      <ModeChip
        active={mode === "observe"}
        disabled={busy}
        icon={<Eye className="h-3 w-3" />}
        label="Observe"
        onClick={() => void applyMode("observe")}
        testId="browser-agent-mode-observe"
      />
      <ModeChip
        active={mode === "drive"}
        disabled={busy}
        icon={<MousePointer2 className="h-3 w-3" />}
        label="Drive"
        onClick={() => void applyMode("drive")}
        testId="browser-agent-mode-drive"
      />
      {grant ? (
        <span
          className="ml-1 truncate rounded-full bg-muted px-2 py-0.5 text-2xs text-muted-foreground"
          data-testid="browser-agent-status-chip"
          title={`${grant.mode} · ${grant.agentPubkey}`}
        >
          {grant.mode === "drive" ? "Driving" : "Observing"} ·{" "}
          {grant.agentPubkey.slice(0, 8)}
        </span>
      ) : null}
      {grant?.mode === "drive" ? (
        <Button
          data-testid="browser-agent-take-control"
          disabled={busy}
          onClick={() => void handleTakeControl()}
          size="xs"
          type="button"
          variant="secondary"
        >
          <Hand className="mr-1 h-3 w-3" />
          Take control
        </Button>
      ) : null}
      {dialogMode != null ? (
        <BrowserAgentGrantDialog
          channelId={channelId ?? ""}
          mode={dialogMode}
          onOpenChange={(next) => {
            if (!next) setDialogMode(null);
          }}
          onPick={(pick) => {
            void commitGrant(pick);
          }}
          open
          threadRoot={threadRoot}
        />
      ) : null}
    </div>
  );
}

function ModeChip({
  active,
  disabled,
  icon,
  label,
  onClick,
  testId,
}: {
  active: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  label: string;
  onClick: () => void;
  testId: string;
}) {
  return (
    <Button
      aria-pressed={active}
      className={active ? "bg-muted" : undefined}
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      size="xs"
      type="button"
      variant={active ? "secondary" : "ghost"}
    >
      {icon}
      <span className={icon ? "ml-1" : undefined}>{label}</span>
    </Button>
  );
}
