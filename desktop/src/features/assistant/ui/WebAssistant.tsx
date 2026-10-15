import { createPortal } from "react-dom";
// Web Assistant: the open-source web flow for "your Assistant" (the desktop's full Assistant is a protected feature that
// the public web build does not include). Which agent is your Assistant is synced in the inbox-state doc
// (features/inbox/assistantPick.ts); the desktop shares its own assignment there, and over Direct the web can import it
// right away. Asking = a DM with that agent over the relay (signed by your signer), so it works without Direct.
// Starting a stopped desktop agent needs Direct and is greyed out without it.
import { isTauri } from "@tauri-apps/api/core";
import { decode } from "nostr-tools/nip19";
import { Bot, ChevronDown, Star } from "lucide-react";
import { useRouter } from "@tanstack/react-router";
import * as React from "react";
import { toast } from "sonner";

import { buildAskContext, queueAsk } from "@/features/assistant/askBus";
import type { TimelineMessage } from "@/features/messages/types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";

import { ProfileAgentActionRow } from "@/features/profile/ui/UserProfileAgentManagementRows";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";

import { AssistantPopoverBody } from "@/features/assistantData/ui/AssistantChat";
import { Button } from "@/shared/ui/button";
import { useAppNavigation } from "@/app/navigation/useAppNavigation";
import { useManagedAgentsQuery } from "@/features/agents/hooks";
import { useCommunities } from "@/features/communities/useCommunities";
import {
  setSyncedAssistant,
  useSyncedAssistant,
} from "@/features/inbox/assistantPick";
import { useUserProfileQuery } from "@/features/profile/hooks";
import { useIdentityQuery } from "@/shared/api/hooks";
import { invokeTauri } from "@/shared/api/tauri";
import {
  setAssistantPubkey,
  useAssistantPubkey,
} from "@/shared/lib/assistantIdentity";
import { cn } from "@/shared/lib/cn";
import { proxyDirectLive, subscribeProxy } from "@/features/bridge/remoteCmd";

const OPEN_EVENT = "buzz-web-assistant-open";
const ASSIST_SENTINEL = "__buzzAssistPopup";
const HEX64 = /^[0-9a-f]{64}$/;

/** Open the Assistant sheet from anywhere (phone + button, Inbox Assistant tab). */
const TOGGLE_EVENT = "buzz-web-assistant-toggle";
const STATE_EVENT = "buzz-web-assistant-state";
let assistantVisible = false;
/** True while the Assistant popup is showing (open or sliding closed). */
export function useWebAssistantOpen(): boolean {
  return React.useSyncExternalStore(
    (cb) => {
      window.addEventListener(STATE_EVENT, cb);
      return () => window.removeEventListener(STATE_EVENT, cb);
    },
    () => assistantVisible,
    () => false,
  );
}
/** Assist tab / sidebar button: open, or close (keeping chat state) if already open. */
export function toggleWebAssistant() {
  window.dispatchEvent(new Event(TOGGLE_EVENT));
}
/** Close the popup if it is showing (phone: tapping another bottom-nav tab). */
export function closeWebAssistant() {
  if (assistantVisible) window.dispatchEvent(new Event(TOGGLE_EVENT));
}
export function openWebAssistant() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export function isWebAssistantAvailable() {
  return !isTauri();
}

function useDirectLive(): boolean {
  return React.useSyncExternalStore(
    subscribeProxy,
    proxyDirectLive,
    () => false,
  );
}

/** Hex pubkey from hex or npub/nprofile text, or null. */
export function parseAgentPubkey(input: string): string | null {
  const t = input.trim().replace(/^nostr:/, "");
  if (HEX64.test(t.toLowerCase())) return t.toLowerCase();
  try {
    const d = decode(t);
    if (d.type === "npub") return String(d.data).toLowerCase();
    if (d.type === "nprofile")
      return String((d.data as { pubkey: string }).pubkey).toLowerCase();
  } catch {
    /* not nip19 */
  }
  return null;
}

/** Web only: publishes the synced pick to the Inbox, and imports the desktop's assignment over Direct. */
export function WebAssistantBinding() {
  const me = useIdentityQuery().data?.pubkey;
  const { activeCommunity } = useCommunities();
  const picked = useSyncedAssistant(me);
  const directLive = useDirectLive();
  React.useEffect(() => {
    setAssistantPubkey(picked);
  }, [picked]);
  React.useEffect(() => {
    if (picked || !directLive || !me || !activeCommunity?.relayUrl) return;
    let cancelled = false;
    void invokeTauri<{ agent_pubkey?: string } | null>(
      "get_bestie_assignment",
      {
        expectedRelayUrl: activeCommunity.relayUrl,
        expectedSignerPubkey: me,
      },
    )
      .then((r) => {
        const pk = r?.agent_pubkey;
        if (!cancelled && pk && HEX64.test(pk)) setSyncedAssistant(me, pk);
      })
      .catch(() => {
        /* older desktop or no assignment */
      });
    return () => {
      cancelled = true;
    };
  }, [picked, directLive, me, activeCommunity?.relayUrl]);
  return null;
}

/**
 * The web Assistant popup: same layout as the desktop popover. Phone: full-screen overlay layer; iPad/desktop: a
 * popup anchored at the bottom-left (by the sidebar Assist button), like desktop. It is an overlay, not a route:
 * nothing behind it navigates, unmounts or loses scroll/drafts. Collapse hides it and keeps its chat/scroll state
 * for the next open; close (X) discards it. No history entries are pushed.
 */
export function WebAssistantSheet() {
  // closed = not mounted; minimized = mounted but hidden (state kept); open = visible.
  const [mode, setModeRaw] = React.useState<
    "closed" | "minimized" | "open" | "closing"
  >("closed");
  const setMode = React.useCallback((next: "closed" | "minimized" | "open") => {
    if (next !== "minimized") return setModeRaw(next);
    // Phone: slide down (~250ms) before hiding; skip for reduced motion / wider screens.
    const animate =
      typeof window !== "undefined" &&
      !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!animate) return setModeRaw("minimized");
    setModeRaw("closing");
    window.setTimeout(
      () => setModeRaw((m) => (m === "closing" ? "minimized" : m)),
      250,
    );
  }, []);
  const [instance, setInstance] = React.useState(0);
  // Back gesture (touch): opening pushes a sentinel history entry for the SAME location; Back pops it and only
  // collapses the popup, so the page behind never navigates. Closing from the UI consumes the sentinel itself.
  const router = useRouter();
  const sentinelRef = React.useRef(false);
  React.useEffect(() => {
    const visible = mode === "open";
    if (visible && !sentinelRef.current && touchLayout()) {
      sentinelRef.current = true;
      const loc = router.history.location;
      router.history.push(`${loc.pathname}${loc.search}${loc.hash}`, {
        ...(loc.state as unknown as Record<string, unknown>),
        [ASSIST_SENTINEL]: true,
      } as never);
    } else if (!visible && mode !== "closing" && sentinelRef.current) {
      sentinelRef.current = false;
      if (
        (router.history.location.state as unknown as Record<string, unknown>)?.[
          ASSIST_SENTINEL
        ]
      ) {
        router.history.back();
      }
    }
  }, [mode, router]);
  React.useEffect(
    () =>
      router.history.subscribe(() => {
        const st = router.history.location.state as unknown as Record<
          string,
          unknown
        >;
        if (sentinelRef.current && !st?.[ASSIST_SENTINEL]) {
          // Back popped our sentinel: collapse (keep chat state), don't navigate further.
          sentinelRef.current = false;
          setMode("minimized");
        }
      }),
    [router, setMode],
  );
  React.useEffect(() => {
    const onOpen = () => setModeRaw("open");
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);
  const modeRef = React.useRef(mode);
  modeRef.current = mode;
  React.useEffect(() => {
    const onToggle = () =>
      modeRef.current === "open" ? setMode("minimized") : setModeRaw("open");
    window.addEventListener(TOGGLE_EVENT, onToggle);
    return () => window.removeEventListener(TOGGLE_EVENT, onToggle);
  }, [setMode]);
  React.useEffect(() => {
    const visible = mode === "open";
    if (assistantVisible !== visible) {
      assistantVisible = visible;
      window.dispatchEvent(new Event(STATE_EVENT));
    }
  }, [mode]);
  React.useEffect(
    () => () => {
      assistantVisible = false;
      window.dispatchEvent(new Event(STATE_EVENT));
    },
    [],
  );
  React.useEffect(() => {
    if (mode !== "open") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMode("minimized");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, setMode]);
  const me = useIdentityQuery().data?.pubkey;
  const picked = useSyncedAssistant(me);
  const { goAgents, goChannel } = useAppNavigation();
  const close = () => {
    setMode("closed");
    setInstance((n) => n + 1);
  };
  const size = usePopupSize();
  if (mode === "closed") return null;
  // Portalled to <body>: inside the app shell an ancestor established a containing block for `fixed`, so the
  // popup was laid out relative to that box (off-screen on iPhone, clipped left on iPad) instead of the viewport.
  return createPortal(
    <div
      className={cn(
        "fixed z-[100] overflow-hidden",
        // Phone: the region between the top nav and the tab bar (both stay visible/usable); clips the slide.
        "inset-x-0 top-[calc(var(--phone-safe-top,env(safe-area-inset-top))+var(--phone-nav-row-h,40px))] bottom-[var(--phone-tabbar-h,calc(env(safe-area-inset-bottom)+4.5rem))]",
        // iPad / desktop: anchored bottom-left near the sidebar Assist button, always clamped inside the viewport
        // with >= 8px on every side.
        "sm:top-auto sm:right-auto sm:bottom-[max(8px,min(4rem,calc(100dvh-728px)))] sm:left-[max(8px,min(0.75rem,calc(100vw-456px)))] sm:h-[min(720px,calc(100dvh-16px))] sm:w-[min(448px,calc(100vw-16px))] sm:overflow-visible",
        mode === "minimized" && "hidden",
      )}
      data-testid="web-assistant-layer"
      style={size.style}
    >
      {size.resizable ? (
        <>
          <div
            aria-hidden="true"
            className="absolute bottom-2 -right-1 top-2 z-30 w-2 cursor-ew-resize touch-none rounded-full hover:bg-border/80"
            data-testid="web-assistant-resize-width"
            onPointerDown={(e) => size.startDrag(e, "width")}
          />
          <div
            aria-hidden="true"
            className="absolute -top-1 left-2 right-2 z-30 h-2 cursor-ns-resize touch-none rounded-full hover:bg-border/80"
            data-testid="web-assistant-resize-height"
            onPointerDown={(e) => size.startDrag(e, "height")}
          />
        </>
      ) : null}
      <div
        aria-label="Assistant"
        aria-modal={mode === "open" || mode === "closing" ? true : undefined}
        className={cn(
          "flex h-full w-full flex-col overflow-hidden bg-popover p-4 text-popover-foreground max-sm:border-y max-sm:border-border/60",
          "sm:rounded-md sm:border sm:shadow-md",
          // Open/close always animated: phone slides up/down; iPad/desktop scale-fade from the bottom-left anchor.
          "duration-250 ease-out motion-reduce:animate-none sm:origin-bottom-left sm:duration-220",
          mode === "open" &&
            "animate-in slide-in-from-bottom sm:fade-in-0 sm:zoom-in-95 sm:slide-in-from-bottom-4",
          mode === "closing" &&
            "animate-out fill-mode-forwards ease-in slide-out-to-bottom sm:fade-out-0 sm:zoom-out-95 sm:slide-out-to-bottom-4",
        )}
        data-testid="web-assistant-popup"
        role="dialog"
      >
        {picked ? (
          <AssistantPopoverBody
            agentPubkey={picked}
            key={`${picked}:${instance}`}
            onMinimize={() => setMode("minimized")}
            visible={mode === "open"}
            onOpenConversation={(channel) => {
              // Navigating on: leave the sentinel entry in place (popping it would race the navigation).
              sentinelRef.current = false;
              setMode("minimized");
              if (channel) void goChannel(channel.id);
            }}
          />
        ) : (
          <AssistantEmptyState
            onClose={close}
            onGoAgents={() => {
              sentinelRef.current = false;
              setMode("minimized");
              void goAgents();
            }}
          />
        )}
      </div>
    </div>,
    document.body,
  );
}

// No Assistant set: like desktop, you choose one from an agent's profile (Make Assistant), not inside the popup.
function AssistantEmptyState({
  onClose,
  onGoAgents,
}: {
  onClose: () => void;
  onGoAgents: () => void;
}) {
  return (
    <div
      className="flex h-full min-h-0 flex-col gap-3"
      data-testid="web-assistant-empty"
    >
      <div className="flex shrink-0 items-center gap-2">
        <h2 className="min-w-0 flex-1 text-sm font-semibold">Assistant</h2>
        <Button
          aria-label="Close Assistant"
          className="h-9 w-9 rounded-full bg-muted/70 text-foreground hover:bg-muted [&_svg]:size-5 max-sm:h-11 max-sm:w-11 max-sm:[&_svg]:size-6"
          onClick={onClose}
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          <ChevronDown />
        </Button>
      </div>
      <div className="flex min-h-16 flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/70 bg-muted/20 p-6 text-center">
        <Bot className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          No Assistant yet. Open one of your agents and choose{" "}
          <span className="font-medium text-foreground">Make Assistant</span>.
        </p>
        <Button
          data-testid="web-assistant-go-agents"
          onClick={onGoAgents}
          size="sm"
          type="button"
        >
          Go to Agents
        </Button>
      </div>
    </div>
  );
}

/** Web agent profile row (same as desktop's Make/Remove Assistant): writes the synced Assistant pick. */
export function WebAssistantProfileAction({
  agentPubkey,
}: {
  agentPubkey: string;
}) {
  const me = useIdentityQuery().data?.pubkey;
  const picked = useSyncedAssistant(me);
  const agents = useManagedAgentsQuery().data ?? [];
  const profile = useUserProfileQuery(agentPubkey).data as
    | { displayName?: string | null; botType?: unknown; isAgent?: boolean }
    | undefined;
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const name = profile?.displayName ?? "this agent";
  const pk = agentPubkey.toLowerCase();
  const isAgent =
    Boolean(profile?.isAgent) ||
    agents.some((a) => a.pubkey.toLowerCase() === pk);
  if (!isWebAssistantAvailable() || !isAgent) return null;
  const isAssistant = picked?.toLowerCase() === pk;
  const save = (value: string | null) => {
    if (!setSyncedAssistant(me, value)) {
      toast.error("Still syncing your settings. Try again in a moment.");
      return false;
    }
    return true;
  };
  return (
    <>
      <ProfileAgentActionRow
        icon={Star}
        iconClassName={
          isAssistant
            ? "h-4 w-4 shrink-0 fill-current text-foreground"
            : undefined
        }
        label={isAssistant ? "Remove Assistant" : "Make Assistant"}
        onClick={() => (isAssistant ? save(null) : setConfirmOpen(true))}
        testId="user-profile-web-assistant-action"
      />
      <AlertDialog onOpenChange={setConfirmOpen} open={confirmOpen}>
        <AlertDialogContent data-testid="web-assistant-confirm-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Make {name} your Assistant?</AlertDialogTitle>
            <AlertDialogDescription>
              {name} will open from the Assist button. Your pick syncs to your
              other devices.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                if (!save(pk)) event.preventDefault();
              }}
            >
              Make Assistant
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Assistant avatar (round) when set and loadable, else a robot icon. */
export function AssistantGlyph({
  className,
  robotClassName,
}: {
  className: string;
  robotClassName: string;
}) {
  const assistantPubkey = useAssistantPubkey();
  const profile = useUserProfileQuery(assistantPubkey ?? undefined).data;
  const avatarUrl = assistantPubkey ? (profile?.avatarUrl ?? null) : null;
  const [failed, setFailed] = React.useState<string | null>(null);
  if (avatarUrl && failed !== avatarUrl) {
    return (
      <img
        alt=""
        className={cn("rounded-full object-cover", className)}
        data-testid="assistant-glyph-avatar"
        onError={() => setFailed(avatarUrl)}
        referrerPolicy="no-referrer"
        src={avatarUrl}
      />
    );
  }
  return <Bot className={robotClassName} data-testid="assistant-glyph-robot" />;
}

/** Desktop-width / iPad web: Assist button in the sidebar profile row (where the desktop's Assistant button sits). */
export function WebAssistSidebarButton() {
  const assistantPubkey = useAssistantPubkey();
  const name = useUserProfileQuery(assistantPubkey ?? undefined).data
    ?.displayName;
  const assistantOpen = useWebAssistantOpen();
  if (!isWebAssistantAvailable()) return null;
  const label = name ? `Assist — ${name}` : "Assist";
  return (
    <button
      aria-label={label}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/70 outline-hidden transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground"
      data-testid="sidebar-assist-button"
      onClick={(event) => {
        event.stopPropagation();
        toggleWebAssistant();
      }}
      aria-pressed={assistantOpen}
      data-active={assistantOpen ? "true" : undefined}
      title={label}
      type="button"
    >
      <AssistantGlyph className="h-6 w-6" robotClassName="h-[18px] w-[18px]" />
    </button>
  );
}

/** Web "Ask Assistant about this message" (message action bar): opens the popup with the message context drafted. */
export function WebAskAssistantMessageAction({
  channelId,
  message,
}: {
  channelId?: string | null;
  message: TimelineMessage;
}) {
  const me = useIdentityQuery().data?.pubkey;
  const picked = useSyncedAssistant(me);
  if (!isWebAssistantAvailable() || !picked || !channelId) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label="Ask Assistant about this message"
          className="h-8 w-8 rounded-full p-0"
          data-testid={`web-assistant-ask-${message.id}`}
          onClick={(event) => {
            event.stopPropagation();
            const text = buildAskContext(channelId, message);
            if (text) queueAsk(text);
            openWebAssistant();
          }}
          size="sm"
          type="button"
          variant="ghost"
        >
          <AssistantGlyph className="h-5 w-5" robotClassName="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Ask Assistant</TooltipContent>
    </Tooltip>
  );
}

// Desktop-width web: drag the right edge (width) and top edge (height) like the desktop popover; size persists.
const SIZE_KEY = "buzz-assistant-popup-size.v1";
const MIN_W = 360;
const MAX_W = 900;
const MIN_H = 420;
const MAX_H = 1000;
function readSize(): { w: number; h: number } | null {
  try {
    const v = JSON.parse(window.localStorage.getItem(SIZE_KEY) ?? "null");
    return v && typeof v.w === "number" && typeof v.h === "number" ? v : null;
  } catch {
    return null;
  }
}
function usePopupSize() {
  const desktopWidth = React.useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia?.("(min-width: 1024px) and (pointer: fine)");
      mq?.addEventListener("change", cb);
      return () => mq?.removeEventListener("change", cb);
    },
    () =>
      Boolean(
        window.matchMedia?.("(min-width: 1024px) and (pointer: fine)").matches,
      ),
    () => false,
  );
  const [size, setSize] = React.useState(readSize);
  const startDrag = (e: React.PointerEvent, axis: "width" | "height") => {
    e.preventDefault();
    const layer = (e.currentTarget as HTMLElement).parentElement;
    if (!layer) return;
    const rect = layer.getBoundingClientRect();
    const start = { x: e.clientX, y: e.clientY, w: rect.width, h: rect.height };
    let latest = { w: rect.width, h: rect.height };
    const move = (ev: PointerEvent) => {
      latest =
        axis === "width"
          ? {
              w: Math.min(
                MAX_W,
                Math.max(MIN_W, start.w + ev.clientX - start.x),
              ),
              h: start.h,
            }
          : {
              w: start.w,
              h: Math.min(
                MAX_H,
                Math.max(MIN_H, start.h - (ev.clientY - start.y)),
              ),
            };
      setSize(latest);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      try {
        window.localStorage.setItem(SIZE_KEY, JSON.stringify(latest));
      } catch {
        /* UI preference only */
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const style: React.CSSProperties | undefined =
    desktopWidth && size
      ? {
          width: `min(${Math.round(size.w)}px, calc(100vw - 16px))`,
          height: `min(${Math.round(size.h)}px, calc(100dvh - 16px))`,
          bottom: `max(8px, min(4rem, calc(100dvh - ${Math.round(size.h)}px - 8px)))`,
          left: `max(8px, min(0.75rem, calc(100vw - ${Math.round(size.w)}px - 8px)))`,
        }
      : undefined;
  return { resizable: desktopWidth, startDrag, style };
}

function touchLayout(): boolean {
  return Boolean(
    window.matchMedia?.("(max-width: 1023px), (pointer: coarse)").matches,
  );
}
