import { createPortal } from "react-dom";
// Web Assistant: the open-source web flow for "your Assistant" (the desktop's full Assistant is a protected feature that
// the public web build does not include). Which agent is your Assistant is synced in the inbox-state doc
// (features/inbox/assistantPick.ts); the desktop shares its own assignment there, and over Direct the web can import it
// right away. Asking = a DM with that agent over the relay (signed by your signer), so it works without Direct.
// Starting a stopped desktop agent needs Direct and is greyed out without it.
import { isTauri } from "@tauri-apps/api/core";
import { decode } from "nostr-tools/nip19";
import { Bot, ChevronDown, Loader2, Monitor, Sparkles } from "lucide-react";
import * as React from "react";

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
import { ProfileAvatar } from "@/features/profile/ui/ProfileAvatar";
import { useIdentityQuery } from "@/shared/api/hooks";
import { invokeTauri } from "@/shared/api/tauri";
import {
  setAssistantPubkey,
  useAssistantPubkey,
} from "@/shared/lib/assistantIdentity";
import { cn } from "@/shared/lib/cn";
import { proxyDirectLive, subscribeProxy } from "@/features/bridge/remoteCmd";

const OPEN_EVENT = "buzz-web-assistant-open";
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

const ROW =
  "flex w-full items-center gap-3 rounded-xl border border-border/60 bg-card px-4 py-3 text-left text-sm transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50";

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
      window.matchMedia?.("(max-width: 639px)").matches &&
      !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!animate) return setModeRaw("minimized");
    setModeRaw("closing");
    window.setTimeout(
      () => setModeRaw((m) => (m === "closing" ? "minimized" : m)),
      250,
    );
  }, []);
  const [picking, setPicking] = React.useState(false);
  const [instance, setInstance] = React.useState(0);
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
  const { goChannel } = useAppNavigation();
  const close = () => {
    setMode("closed");
    setPicking(false);
    setInstance((n) => n + 1);
  };
  if (mode === "closed") return null;
  const showPicker = picking || !picked;
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
    >
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
        {showPicker ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mb-2 flex justify-end gap-1">
              <Button
                aria-label="Close Assistant"
                className="h-9 w-9 rounded-full bg-muted/70 text-foreground hover:bg-muted [&_svg]:size-5 max-sm:h-11 max-sm:w-11 max-sm:[&_svg]:size-6"
                onClick={() => (picked ? setMode("minimized") : close())}
                size="icon-xs"
                type="button"
                variant="ghost"
              >
                <ChevronDown />
              </Button>
            </div>
            <AssistantPicker
              current={picked}
              me={me}
              onCancel={picked ? () => setPicking(false) : undefined}
              onPicked={() => setPicking(false)}
            />
          </div>
        ) : picked ? (
          <AssistantPopoverBody
            agentPubkey={picked}
            key={`${picked}:${instance}`}
            onChange={() => setPicking(true)}
            onClose={close}
            onMinimize={() => setMode("minimized")}
            onOpenConversation={(channel) => {
              setMode("minimized");
              if (channel) void goChannel(channel.id);
            }}
          />
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

function AssistantPicker({
  current,
  me,
  onCancel,
  onPicked,
}: {
  current: string | null;
  me: string | undefined;
  onCancel?: () => void;
  onPicked: () => void;
}) {
  const agents = useManagedAgentsQuery().data ?? [];
  const directLive = useDirectLive();
  const { activeCommunity } = useCommunities();
  const [manual, setManual] = React.useState("");
  const [note, setNote] = React.useState<string | null>(null);
  const [importing, setImporting] = React.useState(false);

  const pick = (pk: string) => {
    if (setSyncedAssistant(me, pk)) onPicked();
    else setNote("Still syncing your inbox settings. Try again in a moment.");
  };

  const importDesktop = async () => {
    if (!me || !activeCommunity?.relayUrl) return;
    setImporting(true);
    setNote(null);
    try {
      const r = await invokeTauri<{ agent_pubkey?: string } | null>(
        "get_bestie_assignment",
        {
          expectedRelayUrl: activeCommunity.relayUrl,
          expectedSignerPubkey: me,
        },
      );
      if (r?.agent_pubkey) pick(r.agent_pubkey);
      else setNote("Your desktop has no assistant set for this community.");
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Couldn't reach your desktop.");
    } finally {
      setImporting(false);
    }
  };

  const manualPk = parseAgentPubkey(manual);
  return (
    <>
      <div className="mb-3 space-y-1">
        <h2 className="text-sm font-semibold">
          {current ? "Change assistant" : "Choose your assistant"}
        </h2>
        <p className="text-xs text-muted-foreground">
          Your pick syncs to your other devices.
        </p>
      </div>
      <div
        className="flex flex-col gap-2 px-4 pb-2"
        data-testid="web-assistant-picker"
      >
        <button
          className={ROW}
          data-testid="web-assistant-use-desktop"
          disabled={!directLive || importing}
          onClick={() => void importDesktop()}
          type="button"
        >
          {importing ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Monitor className="h-5 w-5 text-muted-foreground" />
          )}
          <span className="flex flex-1 flex-col">
            <span>Use my desktop's assistant</span>
            {!directLive ? (
              <span className="text-xs text-muted-foreground">
                Needs your desktop connected (Direct)
              </span>
            ) : null}
          </span>
        </button>
        {agents.length > 0 ? (
          <div className="pt-1 text-xs font-medium text-muted-foreground">
            Your agents
          </div>
        ) : null}
        {agents.map((agent) => {
          const pk = agent.pubkey.toLowerCase();
          return (
            <button
              className={cn(
                ROW,
                pk === current && "border-primary/50 bg-primary/10",
              )}
              data-testid={`web-assistant-pick-${pk.slice(0, 8)}`}
              key={pk}
              onClick={() => pick(pk)}
              type="button"
            >
              <ProfileAvatar
                avatarUrl={agent.avatarUrl ?? null}
                className="h-8 w-8"
                label={agent.name}
                pubkey={pk}
              />
              <span className="flex-1 truncate">{agent.name}</span>
              {pk === current ? (
                <Sparkles className="h-4 w-4 text-primary" />
              ) : (
                <Bot className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
          );
        })}
        <form
          className="flex items-center gap-2 pt-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (manualPk) pick(manualPk);
          }}
        >
          <input
            aria-label="Agent npub or pubkey"
            className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
            onChange={(e) => setManual(e.target.value)}
            placeholder="Or paste an agent's npub"
            value={manual}
          />
          <button
            className="h-10 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
            disabled={!manualPk}
            type="submit"
          >
            Use
          </button>
        </form>
        {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
        {current ? (
          <div className="flex justify-between pt-1">
            <button
              className="text-xs text-muted-foreground hover:text-destructive"
              onClick={() => {
                if (setSyncedAssistant(me, null)) onPicked();
              }}
              type="button"
            >
              Remove assistant
            </button>
            {onCancel ? (
              <button
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={onCancel}
                type="button"
              >
                Cancel
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
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
