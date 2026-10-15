// Web Assistant: the open-source web flow for "your Assistant" (the desktop's full Assistant is a protected feature that
// the public web build does not include). Which agent is your Assistant is synced in the inbox-state doc
// (features/inbox/assistantPick.ts); the desktop shares its own assignment there, and over Direct the web can import it
// right away. Asking = a DM with that agent over the relay (signed by your signer), so it works without Direct.
// Starting a stopped desktop agent needs Direct and is greyed out without it.
import { isTauri } from "@tauri-apps/api/core";
import { decode } from "nostr-tools/nip19";
import { Bot, Loader2, MessageSquare, Monitor, Play, Send, Sparkles } from "lucide-react";
import * as React from "react";

import { useAppNavigation } from "@/app/navigation/useAppNavigation";
import { useManagedAgentsQuery } from "@/features/agents/hooks";
import { useOpenDmMutation } from "@/features/channels/hooks";
import { useCommunities } from "@/features/communities/useCommunities";
import { setSyncedAssistant, useSyncedAssistant } from "@/features/inbox/assistantPick";
import { usePresenceQuery } from "@/features/presence/hooks";
import { useUserProfileQuery } from "@/features/profile/hooks";
import { ProfileAvatar } from "@/features/profile/ui/ProfileAvatar";
import { useIdentityQuery } from "@/shared/api/hooks";
import { invokeTauri } from "@/shared/api/tauri";
import { startManagedAgent } from "@/shared/api/tauriManagedAgents";
import { setAssistantPubkey } from "@/shared/lib/assistantIdentity";
import { cn } from "@/shared/lib/cn";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/ui/sheet";
import { proxyDirectLive, subscribeProxy } from "@/features/bridge/remoteCmd";

const OPEN_EVENT = "buzz-web-assistant-open";
const HEX64 = /^[0-9a-f]{64}$/;

/** Open the Assistant sheet from anywhere (phone + button, Inbox Assistant tab). */
export function openWebAssistant() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export function isWebAssistantAvailable() {
  return !isTauri();
}

function useDirectLive(): boolean {
  return React.useSyncExternalStore(subscribeProxy, proxyDirectLive, () => false);
}

/** Hex pubkey from hex or npub/nprofile text, or null. */
export function parseAgentPubkey(input: string): string | null {
  const t = input.trim().replace(/^nostr:/, "");
  if (HEX64.test(t.toLowerCase())) return t.toLowerCase();
  try {
    const d = decode(t);
    if (d.type === "npub") return String(d.data).toLowerCase();
    if (d.type === "nprofile") return String((d.data as { pubkey: string }).pubkey).toLowerCase();
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
    void invokeTauri<{ agent_pubkey?: string } | null>("get_bestie_assignment", {
      expectedRelayUrl: activeCommunity.relayUrl,
      expectedSignerPubkey: me,
    })
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

export function WebAssistantSheet() {
  const [open, setOpen] = React.useState(false);
  const [picking, setPicking] = React.useState(false);
  React.useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);
  const me = useIdentityQuery().data?.pubkey;
  const picked = useSyncedAssistant(me);
  React.useEffect(() => {
    if (!open) setPicking(false);
  }, [open]);
  const showPicker = picking || !picked;
  return (
    <Sheet onOpenChange={setOpen} open={open}>
      <SheetContent
        className="z-[130] max-h-[85dvh] overflow-y-auto rounded-t-2xl pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:mx-auto sm:max-w-lg"
        data-testid="web-assistant-sheet"
        side="bottom"
      >
        {showPicker ? (
          <AssistantPicker
            current={picked}
            me={me}
            onCancel={picked ? () => setPicking(false) : undefined}
            onPicked={() => setPicking(false)}
          />
        ) : picked ? (
          <AssistantHome
            agentPubkey={picked}
            onChange={() => setPicking(true)}
            onClose={() => setOpen(false)}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function AssistantHome({
  agentPubkey,
  onChange,
  onClose,
}: {
  agentPubkey: string;
  onChange: () => void;
  onClose: () => void;
}) {
  const profile = useUserProfileQuery(agentPubkey).data;
  const presence = usePresenceQuery([agentPubkey]).data?.[agentPubkey] ?? "offline";
  const agents = useManagedAgentsQuery().data ?? [];
  const managed = agents.find((a) => a.pubkey.toLowerCase() === agentPubkey);
  const directLive = useDirectLive();
  const { activeCommunity } = useCommunities();
  const me = useIdentityQuery().data?.pubkey;
  const openDm = useOpenDmMutation();
  const { goChannel } = useAppNavigation();
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState<null | "send" | "open" | "start">(null);
  const [error, setError] = React.useState<string | null>(null);
  const name = profile?.displayName || managed?.name || "Assistant";

  const go = async (draft?: string) => {
    setError(null);
    setBusy(draft ? "send" : "open");
    try {
      const channel = await openDm.mutateAsync({
        pubkeys: [agentPubkey],
        ...(activeCommunity?.relayUrl ? { expectedRelayUrl: activeCommunity.relayUrl } : {}),
        ...(me ? { expectedSignerPubkey: me } : {}),
      });
      onClose();
      setText("");
      await goChannel(channel.id, draft ? { autoSend: draft } : undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open the conversation.");
    } finally {
      setBusy(null);
    }
  };

  const start = async () => {
    setError(null);
    setBusy("start");
    try {
      await startManagedAgent(agentPubkey, {
        ...(activeCommunity?.relayUrl ? { expectedRelayUrl: activeCommunity.relayUrl } : {}),
        ...(me ? { expectedSignerPubkey: me } : {}),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start the assistant.");
    } finally {
      setBusy(null);
    }
  };

  const canStart = Boolean(managed) && presence === "offline";
  return (
    <>
      <SheetHeader>
        <div className="flex items-center gap-3">
          <ProfileAvatar
            avatarUrl={profile?.avatarUrl ?? managed?.avatarUrl ?? null}
            className="h-10 w-10"
            label={name}
            pubkey={agentPubkey}
          />
          <div className="min-w-0 flex-1 text-left">
            <SheetTitle className="truncate">{name}</SheetTitle>
            <SheetDescription className="flex items-center gap-1.5">
              <span
                className={cn(
                  "inline-block h-2 w-2 rounded-full",
                  presence === "online" ? "bg-emerald-500" : presence === "away" ? "bg-amber-500" : "bg-muted-foreground/50",
                )}
              />
              Your assistant · {presence === "online" ? "Online" : presence === "away" ? "Away" : "Offline"}
            </SheetDescription>
          </div>
          <button
            className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            data-testid="web-assistant-change"
            onClick={onChange}
            type="button"
          >
            Change
          </button>
        </div>
      </SheetHeader>
      <div className="flex flex-col gap-3 px-4 pb-2">
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const t = text.trim();
            if (t && !busy) void go(t);
          }}
        >
          <textarea
            aria-label={`Ask ${name}`}
            className="min-h-[44px] flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-[15px] outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="web-assistant-input"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder={`Ask ${name}…`}
            rows={2}
            value={text}
          />
          <button
            aria-label="Send"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-50"
            data-testid="web-assistant-send"
            disabled={!text.trim() || busy !== null}
            type="submit"
          >
            {busy === "send" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          </button>
        </form>
        <button className={ROW} data-testid="web-assistant-open" disabled={busy !== null} onClick={() => void go()} type="button">
          {busy === "open" ? <Loader2 className="h-5 w-5 animate-spin" /> : <MessageSquare className="h-5 w-5 text-muted-foreground" />}
          <span className="flex-1">Open conversation</span>
        </button>
        {canStart ? (
          <button
            className={ROW}
            data-testid="web-assistant-start"
            disabled={!directLive || busy !== null}
            onClick={() => void start()}
            title={directLive ? undefined : "Needs your desktop connected (Direct)"}
            type="button"
          >
            {busy === "start" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5 text-muted-foreground" />}
            <span className="flex flex-1 flex-col">
              <span>Start assistant on your desktop</span>
              {!directLive ? (
                <span className="text-xs text-muted-foreground">Needs your desktop connected (Direct)</span>
              ) : null}
            </span>
          </button>
        ) : null}
        {error ? (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Replies land in Inbox → Assistant. Lists, jobs, coffee chats and the quick popover are in the desktop app.
        </p>
      </div>
    </>
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
      const r = await invokeTauri<{ agent_pubkey?: string } | null>("get_bestie_assignment", {
        expectedRelayUrl: activeCommunity.relayUrl,
        expectedSignerPubkey: me,
      });
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
      <SheetHeader>
        <SheetTitle>{current ? "Change assistant" : "Choose your assistant"}</SheetTitle>
        <SheetDescription>Your pick syncs to your other devices.</SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-2 px-4 pb-2" data-testid="web-assistant-picker">
        <button
          className={ROW}
          data-testid="web-assistant-use-desktop"
          disabled={!directLive || importing}
          onClick={() => void importDesktop()}
          type="button"
        >
          {importing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Monitor className="h-5 w-5 text-muted-foreground" />}
          <span className="flex flex-1 flex-col">
            <span>Use my desktop's assistant</span>
            {!directLive ? (
              <span className="text-xs text-muted-foreground">Needs your desktop connected (Direct)</span>
            ) : null}
          </span>
        </button>
        {agents.length > 0 ? (
          <div className="pt-1 text-xs font-medium text-muted-foreground">Your agents</div>
        ) : null}
        {agents.map((agent) => {
          const pk = agent.pubkey.toLowerCase();
          return (
            <button
              className={cn(ROW, pk === current && "border-primary/50 bg-primary/10")}
              data-testid={`web-assistant-pick-${pk.slice(0, 8)}`}
              key={pk}
              onClick={() => pick(pk)}
              type="button"
            >
              <ProfileAvatar avatarUrl={agent.avatarUrl ?? null} className="h-8 w-8" label={agent.name} pubkey={pk} />
              <span className="flex-1 truncate">{agent.name}</span>
              {pk === current ? <Sparkles className="h-4 w-4 text-primary" /> : <Bot className="h-4 w-4 text-muted-foreground" />}
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
              <button className="text-xs text-muted-foreground hover:text-foreground" onClick={onCancel} type="button">
                Cancel
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
}
