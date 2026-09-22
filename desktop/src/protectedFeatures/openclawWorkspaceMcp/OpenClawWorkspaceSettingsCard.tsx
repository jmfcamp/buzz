import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useFeatureEnabled } from "@/shared/features";
import { Button } from "@/shared/ui/button";
import {
  disconnectOpenClawWorkspace,
  fetchOpenClawWorkspaceStatus,
  refreshOpenClawWorkspace,
  testOpenClawWorkspace,
  type OpenClawWorkspaceStatus,
} from "./api";

function formatExpiry(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = Date.parse(iso);
  if (Number.isNaN(d)) return iso;
  return new Date(d).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

type BusyAction = "test" | "refresh" | "disconnect" | null;

export function OpenClawWorkspaceSettingsCard() {
  const enabled = useFeatureEnabled("openclaw-workspace-mcp");
  const [status, setStatus] = useState<OpenClawWorkspaceStatus | null>(null);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setError(null);
      setStatus(await fetchOpenClawWorkspaceStatus());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void reload();
  }, [enabled, reload]);

  if (!enabled) return null;

  const connected = status?.connected === true;
  const anyBusy = busy !== null;

  async function runAction(
    action: Exclude<BusyAction, null>,
    work: () => Promise<void>,
  ) {
    setBusy(action);
    setError(null);
    try {
      await work();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      toast.error(message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className="rounded-xl border border-border/60 bg-card/40 p-4"
      data-testid="settings-openclaw-workspace"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-medium text-foreground">OpenClaw workspace</h3>
          <p className="mt-0.5 text-sm text-muted-foreground/70">
            {connected
              ? status?.connectedViaRelay
                ? "Connected via relay"
                : "Connected"
              : "Not connected"}
          </p>
          {connected ? (
            <p className="mt-1 text-sm text-muted-foreground/70">
              Expires {formatExpiry(status?.expiresAt)}
              {status?.url ? (
                <span className="block truncate opacity-80">{status.url}</span>
              ) : null}
              <span className="mt-1 block">
                OpenClaw FS + skill pack mode is available. Enable it per agent
                in Advanced → “Use OpenClaw workspace (MCP)”.
              </span>
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground/70">
              Join a Hula relay that provisions workspace MCP to connect
              automatically. After connecting, turn on “Use OpenClaw workspace
              (MCP)” on each agent that should use remote FS + skills_list /
              skills_get (default stays local).
            </p>
          )}
          {error ? (
            <p className="mt-2 text-sm text-destructive">{error}</p>
          ) : null}
        </div>
        {connected ? (
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={anyBusy}
              data-testid="settings-openclaw-workspace-test"
              onClick={() => {
                void runAction("test", async () => {
                  const result = await testOpenClawWorkspace();
                  if (result.ok) {
                    toast.success(result.message);
                  } else {
                    setError(result.message);
                    toast.error(result.message);
                  }
                });
              }}
            >
              {busy === "test" ? "Testing…" : "Test"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={anyBusy}
              data-testid="settings-openclaw-workspace-refresh"
              onClick={() => {
                void runAction("refresh", async () => {
                  const next = await refreshOpenClawWorkspace();
                  setStatus(next);
                  toast.success(
                    "Re-applied the stored grant to Claude MCP configs. A new JWT arrives on the next relay AUTH.",
                  );
                });
              }}
            >
              {busy === "refresh" ? "Refreshing…" : "Refresh"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={anyBusy}
              data-testid="settings-openclaw-workspace-disconnect"
              onClick={() => {
                void runAction("disconnect", async () => {
                  const next = await disconnectOpenClawWorkspace();
                  setStatus(next);
                  toast.success("Disconnected OpenClaw workspace.");
                });
              }}
            >
              {busy === "disconnect" ? "Disconnecting…" : "Disconnect"}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
