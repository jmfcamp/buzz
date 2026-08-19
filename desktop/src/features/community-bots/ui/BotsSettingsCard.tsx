import { Bot, LoaderCircle } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import {
  useCommunityBotsQuery,
  useCommunityBotsRemoteAgentsQuery,
  useCommunityBotsStatusQuery,
  useConnectCommunityBotsMutation,
  useDisconnectCommunityBotsMutation,
  useInstallCommunityBotMutation,
  useUninstallCommunityBotMutation,
} from "@/features/community-bots/hooks";
import {
  pairingRequestIdLabel,
  type CommunityBot,
  type RemoteOpenClawAgent,
} from "@/features/community-bots/lib/types";
import { SettingsOptionGroup } from "@/features/settings/ui/SettingsOptionGroup";
import { SettingsSectionHeader } from "@/features/settings/ui/SettingsSectionHeader";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";

const PENDING_POLL_MS = 4_000;

export function BotsSettingsCard() {
  const statusQuery = useCommunityBotsStatusQuery();
  const catalogQuery = useCommunityBotsQuery();
  const status = statusQuery.data;
  const connected = status?.state === "connected";
  const pending = status?.state === "pending";
  const remoteQuery = useCommunityBotsRemoteAgentsQuery(connected);
  const connectMutation = useConnectCommunityBotsMutation();
  const disconnectMutation = useDisconnectCommunityBotsMutation();
  const installMutation = useInstallCommunityBotMutation();
  const uninstallMutation = useUninstallCommunityBotMutation();

  const [url, setUrl] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [token, setToken] = React.useState("");

  React.useEffect(() => {
    if (status?.url && !url) {
      setUrl(status.url);
    }
  }, [status?.url, url]);

  React.useEffect(() => {
    if (!pending) return;
    const timer = window.setInterval(() => {
      void connectMutation.mutateAsync({
        url: status?.url || url,
        password,
        token: token.trim() || undefined,
      });
    }, PENDING_POLL_MS);
    return () => window.clearInterval(timer);
  }, [pending, connectMutation, password, status?.url, token, url]);

  const installed = catalogQuery.data ?? [];
  const installedById = new Map(installed.map((bot) => [bot.id, bot]));
  const remoteAgents = remoteQuery.data ?? [];

  async function handleConnect(event: React.FormEvent) {
    event.preventDefault();
    try {
      const next = await connectMutation.mutateAsync({
        url,
        password,
        token: token.trim() || undefined,
      });
      if (next.state === "connected") {
        toast.success("Connected to the OpenClaw gateway.");
        setPassword("");
      } else if (next.state === "insufficient_scopes") {
        toast.error(
          "This pairing is read-only. Approve the request that includes operator.write and operator.admin.",
        );
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not connect to the OpenClaw gateway.",
      );
    }
  }

  async function handleDisconnect() {
    try {
      await disconnectMutation.mutateAsync();
      setPassword("");
      toast.success("Disconnected the OpenClaw gateway.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not disconnect the gateway.",
      );
    }
  }

  async function handleInstall(agent: RemoteOpenClawAgent) {
    try {
      await installMutation.mutateAsync(agent);
      toast.success(`Installed ${agent.name || agent.id} as a community bot.`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not install that bot.",
      );
    }
  }

  async function handleUninstall(bot: CommunityBot) {
    try {
      await uninstallMutation.mutateAsync(bot);
      toast.success(`Uninstalled ${bot.name}.`);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not uninstall that bot.",
      );
    }
  }

  return (
    <section className="min-w-0" data-testid="settings-bots">
      <SettingsSectionHeader
        description="Connect an OpenClaw gateway so its remote agents can be installed as community members. The VPS keeps them talking; this device is only the admin console."
        title="Bots"
      />

      {statusQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading bots…</p>
      ) : (
        <div className="space-y-6">
          <SettingsOptionGroup
            description="Use the gateway WebSocket URL and password. Do not put the password in the URL."
            title="OpenClaw gateway"
          >
            <form className="space-y-3 p-4 sm:p-5" onSubmit={handleConnect}>
              <div className="space-y-1.5">
                <label
                  className="text-sm font-medium"
                  htmlFor="settings-bots-url"
                >
                  URL
                </label>
                <Input
                  autoCapitalize="none"
                  autoCorrect="off"
                  data-testid="settings-bots-url"
                  id="settings-bots-url"
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="wss://…"
                  spellCheck={false}
                  type="url"
                  value={url}
                />
              </div>
              <div className="space-y-1.5">
                <label
                  className="text-sm font-medium"
                  htmlFor="settings-bots-password"
                >
                  Password
                </label>
                <Input
                  autoComplete="off"
                  data-testid="settings-bots-password"
                  id="settings-bots-password"
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={
                    status?.hasPassword ? "Password saved on this device" : ""
                  }
                  type="password"
                  value={password}
                />
              </div>
              <div className="space-y-1.5">
                <label
                  className="text-sm font-medium"
                  htmlFor="settings-bots-token"
                >
                  Token (optional)
                </label>
                <Input
                  autoComplete="off"
                  data-testid="settings-bots-token"
                  id="settings-bots-token"
                  onChange={(event) => setToken(event.target.value)}
                  type="password"
                  value={token}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  data-testid="settings-bots-connect"
                  disabled={
                    connectMutation.isPending ||
                    !url.trim() ||
                    (!password.trim() && !status?.hasPassword)
                  }
                  type="submit"
                >
                  {connectMutation.isPending ? (
                    <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : null}
                  {pending
                    ? "Check approval"
                    : connected
                      ? "Reconnect"
                      : "Connect"}
                </Button>
                {status?.url ? (
                  <Button
                    data-testid="settings-bots-disconnect"
                    disabled={disconnectMutation.isPending}
                    onClick={() => void handleDisconnect()}
                    type="button"
                    variant="outline"
                  >
                    Disconnect VPS
                  </Button>
                ) : null}
              </div>
            </form>
          </SettingsOptionGroup>

          {pending ? (
            <SettingsOptionGroup title="Pending approval">
              <div
                className="space-y-2 p-4 sm:p-5"
                data-testid="settings-bots-pending"
              >
                <p className="text-sm text-muted-foreground">
                  Approve this device on the OpenClaw gateway. Approving a
                  read-only health check will not work.
                </p>
                <p className="text-sm">
                  Request id:{" "}
                  <code
                    className="rounded bg-muted px-1.5 py-0.5 font-mono text-2xs"
                    data-testid="settings-bots-request-id"
                  >
                    {pairingRequestIdLabel(status?.requestId)}
                  </code>
                </p>
                <p className="text-sm">
                  Device id:{" "}
                  <code
                    className="rounded bg-muted px-1.5 py-0.5 font-mono text-2xs"
                    data-testid="settings-bots-device-id"
                  >
                    {status?.deviceId || "unavailable"}
                  </code>
                </p>
                <p className="text-sm">
                  Requested scopes:{" "}
                  <span data-testid="settings-bots-requested-scopes">
                    {(status?.requestedScopes ?? []).join(", ")}
                  </span>
                </p>
                {!status?.requestId?.trim() ? (
                  <p className="text-sm text-muted-foreground">
                    The gateway did not send a request id. Run{" "}
                    <code className="font-mono text-2xs">
                      openclaw devices list
                    </code>{" "}
                    and approve the Hula Buzz row whose Device ID matches the
                    one on screen (or{" "}
                    <code className="font-mono text-2xs">
                      openclaw devices approve --latest
                    </code>{" "}
                    if only one pending).
                  </p>
                ) : null}
              </div>
            </SettingsOptionGroup>
          ) : null}

          {status?.state === "insufficient_scopes" ? (
            <SettingsOptionGroup title="Insufficient scopes">
              <p
                className="p-4 text-sm text-destructive sm:p-5"
                data-testid="settings-bots-insufficient-scopes"
              >
                The gateway approved{" "}
                {(status.approvedScopes ?? []).join(", ") || "no write scopes"}.
                Approve the request for{" "}
                {(status.requestedScopes ?? []).join(", ")}.
              </p>
            </SettingsOptionGroup>
          ) : null}

          {connected ? (
            <SettingsOptionGroup title="Remote agents">
              <div className="divide-y divide-border/60">
                {remoteQuery.isLoading ? (
                  <p className="px-4 py-6 text-sm text-muted-foreground">
                    Loading remote agents…
                  </p>
                ) : remoteAgents.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-muted-foreground">
                    No remote agents were returned.
                  </p>
                ) : (
                  remoteAgents.map((agent) => {
                    const bot = installedById.get(agent.id);
                    return (
                      <div
                        className="flex items-center gap-3 px-4 py-3"
                        data-testid={`settings-bots-agent-${agent.id}`}
                        key={agent.id}
                      >
                        <Bot className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {agent.name || agent.id}
                          </p>
                          <p className="truncate font-mono text-2xs text-muted-foreground">
                            {agent.id}
                          </p>
                        </div>
                        {bot ? (
                          <span
                            className="text-xs text-muted-foreground"
                            data-testid={`settings-bots-agent-installed-${agent.id}`}
                          >
                            Installed
                          </span>
                        ) : (
                          <Button
                            data-testid={`settings-bots-install-${agent.id}`}
                            disabled={installMutation.isPending}
                            onClick={() => void handleInstall(agent)}
                            size="sm"
                            type="button"
                          >
                            Install
                          </Button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </SettingsOptionGroup>
          ) : null}

          {installed.length > 0 ? (
            <SettingsOptionGroup title="Installed in this community">
              <div className="divide-y divide-border/60">
                {installed.map((bot) => (
                  <div
                    className="flex items-center gap-3 px-4 py-3"
                    data-testid={`settings-bots-installed-${bot.id}`}
                    key={bot.id}
                  >
                    <Bot className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{bot.name}</p>
                      <p className="truncate font-mono text-2xs text-muted-foreground">
                        {bot.id}
                      </p>
                    </div>
                    <Button
                      data-testid={`settings-bots-uninstall-${bot.id}`}
                      disabled={uninstallMutation.isPending}
                      onClick={() => void handleUninstall(bot)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Uninstall
                    </Button>
                  </div>
                ))}
              </div>
            </SettingsOptionGroup>
          ) : null}
        </div>
      )}
    </section>
  );
}
