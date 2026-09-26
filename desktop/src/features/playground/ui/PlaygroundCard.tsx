import { isTauri } from "@tauri-apps/api/core";
import { useLocation } from "@tanstack/react-router";
import { AppWindow, Bot, Copy, Pin } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { deriveShellRoute } from "@/app/AppShell.helpers";
import { setBrowserAgentGrant } from "@/features/browser-agent/lib/api";
import {
  BrowserAgentGrantDialog,
  type BrowserAgentGrantPick,
} from "@/features/browser-agent/ui/BrowserAgentGrantDialog";
import {
  closeLinkSidePanel,
  openLinkSidePanel,
} from "@/features/link-panel/lib/linkSidePanelStore";
import {
  usePopoutSplitLayout,
  usePopoutThreadOnlyLayout,
} from "@/features/popout/lib/popoutLayout";
import {
  openPopoutWindow,
  popoutErrorMessage,
} from "@/features/popout/lib/popoutWindow";
import {
  playgroundConversationFromRoute,
  playgroundConversationHasOpenThread,
  playgroundPinScopeKey,
} from "@/features/playground/lib/conversation";
import {
  getConversationPlaygroundPinsRevision,
  hasConversationPlaygroundPin,
  pinPlaygroundToConversation,
  requestOpenConversationPlaygroundPinsMenu,
  subscribeConversationPlaygroundPins,
} from "@/features/playground/lib/conversationPins";
import { copyTextToClipboard } from "@/shared/lib/clipboard";
import { Button } from "@/shared/ui/button";
import {
  Attachment,
  AttachmentContent,
  AttachmentMedia,
  AttachmentTitle,
} from "@/shared/ui/attachment";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/shared/ui/tooltip";

import { probePlaygroundUrl } from "../lib/probe";
import {
  addPlaygroundSession,
  notePlaygroundCard,
  showPlaygroundSession,
} from "../lib/sessions";
import {
  playgroundPin,
  type PlaygroundCard as PlaygroundCardData,
} from "../lib/types";

const AGENT_ATTACH_TOOLTIP = "Observe & Drive";

function canHostPlayground(): boolean {
  return (
    isTauri() ||
    import.meta.env.MODE === "e2e" ||
    import.meta.env.MODE === "test"
  );
}

async function openPlaygroundInBrowser(url: string) {
  if (import.meta.env.MODE === "test") {
    const stub = (
      globalThis as { __BUZZ_PLAYGROUND_OPEN_URL__?: (nextUrl: string) => void }
    ).__BUZZ_PLAYGROUND_OPEN_URL__;
    if (stub) {
      stub(url);
      return;
    }
  }
  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
    return;
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

function threadIdFromConversation(
  conversation: ReturnType<typeof playgroundConversationFromRoute>,
): string | undefined {
  if (!conversation?.draftKey.startsWith("thread:")) return undefined;
  return conversation.draftKey.slice("thread:".length);
}

export function PlaygroundCard({ card }: { card: PlaygroundCardData }) {
  const [busy, setBusy] = React.useState(false);
  const [grantOpen, setGrantOpen] = React.useState(false);
  const host = canHostPlayground();
  // Split pop-out already shows the playground pane; card actions are inert.
  const actionsDisabled = usePopoutSplitLayout();
  // Thread-only (and split) windowed pop-outs: Open as Split is unavailable.
  const isThreadOnlyLayout = usePopoutThreadOnlyLayout();
  const openAsSplitDisabled = actionsDisabled || isThreadOnlyLayout;
  const pin = playgroundPin(card);
  const location = useLocation();
  const conversation = React.useMemo(() => {
    const route = deriveShellRoute(location.pathname);
    const search = location.search as {
      thread?: unknown;
      threadRootId?: unknown;
    };
    const thread = search.threadRootId ?? search.thread;
    return playgroundConversationFromRoute({
      selectedView: route.selectedView,
      selectedChannelId: route.selectedChannelId,
      threadId: typeof thread === "string" ? thread : null,
    });
  }, [location.pathname, location.search]);

  const isThreadConversation =
    playgroundConversationHasOpenThread(conversation);
  const threadId = threadIdFromConversation(conversation);
  const scopeKey = conversation ? playgroundPinScopeKey(conversation) : null;
  const pinsRevision = React.useSyncExternalStore(
    subscribeConversationPlaygroundPins,
    getConversationPlaygroundPinsRevision,
    getConversationPlaygroundPinsRevision,
  );
  const isPinned = React.useMemo(
    () => Boolean(scopeKey && hasConversationPlaygroundPin(scopeKey, card.sid)),
    [scopeKey, card.sid, pinsRevision],
  );

  React.useEffect(() => {
    notePlaygroundCard(card);
  }, [card]);

  async function ensureUp(): Promise<boolean> {
    const result = await probePlaygroundUrl(card.url);
    if (!result.up) {
      toast.error(result.message ?? "Playground is down.");
      return false;
    }
    return true;
  }

  function handlePin() {
    if (actionsDisabled) return;
    if (!host) {
      void openPlaygroundInBrowser(card.url);
      return;
    }
    if (!conversation || !scopeKey) {
      toast.error("Open a channel or thread to pin a playground.");
      return;
    }
    if (hasConversationPlaygroundPin(scopeKey, card.sid)) {
      requestOpenConversationPlaygroundPinsMenu(scopeKey);
      return;
    }
    setBusy(true);
    void (async () => {
      try {
        if (!(await ensureUp())) return;
        // Pin only adds to this conversation's header list and opens the
        // dropdown — it does not open the slide-out by itself.
        pinPlaygroundToConversation(scopeKey, card, conversation.channelId);
        requestOpenConversationPlaygroundPinsMenu(scopeKey);
      } catch (error) {
        toast.error(popoutErrorMessage(error, "Playground is down."));
      } finally {
        setBusy(false);
      }
    })();
  }

  function handleOpen() {
    if (actionsDisabled) return;
    if (!host) {
      void openPlaygroundInBrowser(card.url);
      return;
    }
    setBusy(true);
    void (async () => {
      try {
        if (!(await ensureUp())) return;
        // RHS idle-auxiliary with PlaygroundChrome / Agent Observe&Drive —
        // same host as pin Open (not grant-less link panel, not window overlay).
        closeLinkSidePanel();
        addPlaygroundSession(card, { preferSidePanel: true });
        showPlaygroundSession(card.sid, { preferSidePanel: true });
      } catch (error) {
        toast.error(popoutErrorMessage(error, "Could not open playground."));
      } finally {
        setBusy(false);
      }
    })();
  }

  function handleOpenAsSplit() {
    if (openAsSplitDisabled) return;
    if (!conversation || !threadId) {
      toast.error("Open a thread first.");
      return;
    }
    if (!host) {
      void openPlaygroundInBrowser(card.url);
      return;
    }
    setBusy(true);
    void (async () => {
      try {
        if (!(await ensureUp())) return;
        await openPopoutWindow({
          kind: "split",
          title: card.name,
          seed: `${card.sid}-${conversation.channelId}-${threadId}`,
          channelId: conversation.channelId,
          threadId,
          playground: card,
        });
      } catch (error) {
        toast.error(popoutErrorMessage(error, "Could not open split."));
      } finally {
        setBusy(false);
      }
    })();
  }

  function handleUrlClick(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (actionsDisabled) return;
    if (openLinkSidePanel(card.url)) return;
    void openPlaygroundInBrowser(card.url);
  }

  function handleAgentAttach() {
    if (actionsDisabled) return;
    if (!host) {
      void openPlaygroundInBrowser(card.url);
      return;
    }
    setGrantOpen(true);
  }

  async function handleGrantPick(pick: BrowserAgentGrantPick) {
    setBusy(true);
    try {
      if (!(await ensureUp())) return;
      closeLinkSidePanel();
      addPlaygroundSession(card, { preferSidePanel: true });
      showPlaygroundSession(card.sid, { preferSidePanel: true });
      await setBrowserAgentGrant({
        surface: "playground",
        surfaceId: card.sid,
        agentId: pick.agentId,
        agentPubkey: pick.agentPubkey,
        channelId: pick.channelId,
        threadRoot: pick.threadRoot,
        mode: pick.mode,
      });
      const base =
        pick.mode === "drive"
          ? `Drive granted to ${pick.agentName}`
          : `Observe granted to ${pick.agentName}`;
      toast.success(
        pick.pinnedToConversation ? `${base} · pinned to conversation` : base,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not set grant.";
      if (message.includes("confirm replace")) {
        if (window.confirm("Replace the current agent grant on this browser?")) {
          try {
            await setBrowserAgentGrant({
              surface: "playground",
              surfaceId: card.sid,
              agentId: pick.agentId,
              agentPubkey: pick.agentPubkey,
              channelId: pick.channelId,
              threadRoot: pick.threadRoot,
              mode: pick.mode,
              allowReplace: true,
            });
            toast.success(
              pick.mode === "drive"
                ? `Drive granted to ${pick.agentName}`
                : `Observe granted to ${pick.agentName}`,
            );
          } catch (retryError) {
            toast.error(
              retryError instanceof Error
                ? retryError.message
                : "Could not set grant.",
            );
          }
        }
      } else {
        toast.error(message);
      }
    } finally {
      setBusy(false);
    }
  }

  function handleCopyPin(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (!pin) return;
    copyTextToClipboard(pin, "PIN copied");
  }

  const pinButton = (
    <Button
      aria-label={isPinned ? "Pinned — open pins menu" : "Pin to conversation"}
      aria-pressed={isPinned || undefined}
      className="text-muted-foreground hover:text-foreground"
      data-testid="playground-card-pin-action"
      disabled={busy || actionsDisabled}
      onClick={(event) => {
        event.stopPropagation();
        handlePin();
      }}
      size="icon-xs"
      type="button"
      variant="ghost"
    >
      <Pin className={isPinned ? "fill-current" : undefined} />
    </Button>
  );

  const agentButton = (
    <Button
      aria-label={AGENT_ATTACH_TOOLTIP}
      data-testid="playground-card-agent-attach"
      disabled={busy || actionsDisabled}
      onClick={(event) => {
        event.stopPropagation();
        handleAgentAttach();
      }}
      size="icon-xs"
      type="button"
      variant="outline"
    >
      <Bot />
    </Button>
  );

  return (
    <Attachment
      className="relative my-2 max-w-md items-start overflow-visible pr-14"
      data-grant-open={grantOpen ? "true" : undefined}
      data-playground-card-actions={actionsDisabled ? "disabled" : "enabled"}
      data-testid="playground-card"
    >
      <div
        className="absolute right-1.5 top-1.5 z-30 flex flex-col items-end gap-1"
        data-testid="playground-card-top-actions"
      >
        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>{agentButton}</TooltipTrigger>
            <TooltipContent side="top">{AGENT_ATTACH_TOOLTIP}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>{pinButton}</TooltipTrigger>
            <TooltipContent side="top">
              {isPinned ? "Pinned — open pins menu" : "Pin to conversation"}
            </TooltipContent>
          </Tooltip>
        </div>
        <Button
          data-testid="playground-card-open"
          disabled={busy || actionsDisabled}
          onClick={(event) => {
            event.stopPropagation();
            handleOpen();
          }}
          size="sm"
          type="button"
        >
          Open
        </Button>
        {isThreadConversation ? (
          <Button
            data-testid="playground-card-open-split"
            disabled={busy || openAsSplitDisabled}
            onClick={(event) => {
              event.stopPropagation();
              handleOpenAsSplit();
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            Open as Split
          </Button>
        ) : null}
      </div>
      <AttachmentMedia>
        <AppWindow />
      </AttachmentMedia>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <AttachmentContent>
          <AttachmentTitle
            className="whitespace-normal break-words"
            data-testid="playground-card-name"
          >
            {card.name}
          </AttachmentTitle>
          <a
            aria-disabled={actionsDisabled || undefined}
            className={
              actionsDisabled
                ? "block whitespace-normal break-all text-xs leading-4 text-muted-foreground opacity-50 pointer-events-none"
                : "block whitespace-normal break-all text-xs leading-4 text-muted-foreground hover:text-foreground hover:underline"
            }
            data-testid="playground-card-url"
            href={card.url}
            onClick={handleUrlClick}
            rel="noopener noreferrer"
            tabIndex={actionsDisabled ? -1 : undefined}
          >
            {card.url}
          </a>
          {pin || card.stack ? (
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              {pin ? (
                <>
                  PIN{" "}
                  <span
                    className="font-mono text-foreground"
                    data-testid="playground-card-pin"
                  >
                    {pin}
                  </span>
                  <button
                    aria-label="Copy PIN"
                    className="inline-flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                    data-testid="playground-card-copy-pin"
                    onClick={handleCopyPin}
                    type="button"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                </>
              ) : null}
              {card.stack ? (
                <>
                  {pin ? " " : null}·{" "}
                  <span data-testid="playground-card-stack">{card.stack}</span>
                </>
              ) : null}
            </p>
          ) : null}
        </AttachmentContent>
      </div>
      {grantOpen ? (
        <BrowserAgentGrantDialog
          channelId={conversation?.channelId ?? ""}
          mode="observe"
          onOpenChange={setGrantOpen}
          onPick={(pick) => {
            void handleGrantPick(pick);
          }}
          open
          playgroundCard={card}
          threadRoot={threadId ?? null}
        />
      ) : null}
    </Attachment>
  );
}
