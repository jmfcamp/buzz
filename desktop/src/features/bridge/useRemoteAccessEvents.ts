import { fetchCommunityBots } from "@/features/community-bots/lib/catalog";
import { HULA_RESERVED_COMMUNITY_BOT_PUBKEYS } from "@/features/agents/lib/reservedCommunityMentionRouting";
// Mounted once in AppShell: keeps the remote-access status fresh and shows a local notification when a remote terminal opens.
import { invoke, isTauri } from "@tauri-apps/api/core";
import { readStoredNotificationSettings } from "@/features/notifications/hooks";
import { listen } from "@tauri-apps/api/event";
import { useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import { discoverAcpRuntimes } from "@/shared/api/tauriAcpDiscovery";
import { createManagedAgent, listManagedAgents, updateManagedAgent } from "@/shared/api/tauri";
import { sendChannelMessage } from "@/shared/api/tauriMessages";
import { startManagedAgent, stopManagedAgent } from "@/shared/api/tauriManagedAgents";
import { managedAgentsQueryKey } from "@/features/agents/hooks";
import { listPersonas } from "@/shared/api/tauriPersonas";
import { CMD_WRITES } from "./directCmd";
import { handleMgmt, mgmtErrorString, type MgmtDeps } from "./directMgmt";
import { createDirectSigner, localSignerStore, type SignerDeps } from "./directSigner";
import { initDesktopBunker } from "./desktopBunkerRuntime";
import { nip44DecryptFromPeer, nip44DecryptFromSelf, nip44EncryptToPeer, nip44EncryptToSelf, signRelayEvent } from "@/shared/api/tauri";
import { getIdentity } from "@/shared/api/tauriIdentity";
import { isAgentManagementAllowed, refreshRemoteAccess, subscribeRemoteAccess } from "./remoteAccessStore";

/** The real agent APIs behind direct-connection management requests. `pubkey` is the signed-in member (scope guard for start). */
export function realMgmtDeps(pubkey: string | undefined): MgmtDeps {
  return {
    allowed: isAgentManagementAllowed,
    listAgents: listManagedAgents,
    startAgent: (a) => startManagedAgent(a, { expectedSignerPubkey: pubkey }),
    stopAgent: stopManagedAgent,
    sendMessage: (a, channelId, text) =>
      sendChannelMessage(channelId, text, null, undefined, [a], undefined, undefined, undefined, undefined, undefined, undefined, pubkey),
    createAgent: createManagedAgent,
    updateAgent: updateManagedAgent,
    runtimes: () => discoverAcpRuntimes(),
    invokeRaw: (cmd, args) => invoke(cmd, args),
    ownerPubkey: pubkey,
    personas: async () => (await listPersonas()).map((p) => ({ id: p.id, displayName: p.displayName })),
  };
}

/** Desktop as signer for this account's approved web devices (keys never leave the desktop). */
// Whose observer frames (kind 24200, encrypted to this account) the desktop decrypts for a paired browser without asking:
// local managed agents, PLUS the community bots in this account's catalog (e.g. OpenClaw agents on a server, which publish
// frames to BUZZ_ACP_AGENT_OWNER) and Hula's reserved bots. hula.8 only allowed local managed agents, so frames from
// server-hosted bots fell back to the remote signer (Primal) on web.
async function ownObserverPeers(): Promise<Set<string>> {
  const keys = new Set<string>();
  for (const a of await listManagedAgents().catch(() => [])) keys.add(a.pubkey.toLowerCase());
  for (const b of await fetchCommunityBots().catch(() => [])) keys.add(String(b.pubkey).toLowerCase());
  for (const k of Object.values(HULA_RESERVED_COMMUNITY_BOT_PUBKEYS)) keys.add(String(k).toLowerCase());
  return keys;
}
let ownAgentsCache: { at: number; keys: Set<string> } | null = null;
const desktopSignerDeps: SignerDeps = {
  store: localSignerStore,
  confirm: async (title, message) =>
    ["Ok", "Yes", "Allow"].includes(
      String(
        await invoke("plugin:dialog|message", { title, message, kind: "warning", buttons: { OkCancelCustom: ["Allow", "Deny"] } }).catch(
          () => "Cancel",
        ),
      ),
    ),
  sign: (ev) => signRelayEvent({ kind: ev.kind, content: ev.content, createdAt: ev.created_at, tags: ev.tags, allowSelfTagging: true }),
  randomHex: (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, "0")).join(""),
  now: Date.now,
  crypt: {
    selfPubkey: async () => (await getIdentity()).pubkey,
    encryptToSelf: nip44EncryptToSelf,
    encryptToPeer: nip44EncryptToPeer,
    decryptFromSelf: nip44DecryptFromSelf,
    decryptFromPeer: nip44DecryptFromPeer,
    isOwnAgent: async (peer) => {
      const now = Date.now();
      if (!ownAgentsCache || now - ownAgentsCache.at > 30_000)
        ownAgentsCache = { at: now, keys: await ownObserverPeers() };
      return ownAgentsCache.keys.has(peer.toLowerCase());
    },
  },
};
const directSigner = createDirectSigner(desktopSignerDeps);

/** Ops that change agent state: the desktop's own agent lists (and the bridge snapshot) must refresh after them. */
const MUTATING_OPS = new Set(["agent.start", "agent.stop", "agent.create", "agent.rename", "agent.update"]);
const MUTATING_CMDS = new Set<string>(CMD_WRITES);
const isMutating = (op: string, params: unknown) =>
  MUTATING_OPS.has(op) || (op === "cmd" && MUTATING_CMDS.has(String((params as { name?: unknown } | null)?.name)));

export function useRemoteAccessEvents(pubkey?: string): void {
  const queryClient = useQueryClient();
  const queryClientRef = React.useRef(queryClient);
  queryClientRef.current = queryClient;
  const pubkeyRef = React.useRef(pubkey);
  pubkeyRef.current = pubkey;
  React.useEffect(() => {
    if (!isTauri()) return;
    // Desktop as NIP-46 bunker for web sign-in (socket only open while a code shows or a browser is paired through it).
    initDesktopBunker({ ...desktopSignerDeps, userPubkey: async () => (await getIdentity()).pubkey });
    const unsubStore = subscribeRemoteAccess(() => {});
    const unlistens: Array<() => void> = [];
    let cancelled = false;
    // Agent management over the direct connection: the Rust listener forwards each authenticated, switch-checked request here.
    void listen<{ reqId: string; op: string; params: unknown }>("remote-mgmt-request", async (e) => {
      const { reqId, op, params } = e.payload;
      try {
        const result = op.startsWith("signer.")
          ? await directSigner.handle(op, params)
          : await handleMgmt(op, params, realMgmtDeps(pubkeyRef.current));
        await invoke("remote_mgmt_reply", { reqId, ok: true, result });
      } catch (err) {
        await invoke("remote_mgmt_reply", { reqId, ok: false, error: mgmtErrorString(err) }).catch(() => {});
      } finally {
        if (isMutating(op, params)) void queryClientRef.current.invalidateQueries({ queryKey: managedAgentsQueryKey });
        // Assistant picked/cleared from the web: refresh the desktop's own Assistant (which then re-shares the pick).
        if (op === "cmd" && /_bestie/.test(String((params as { name?: unknown } | null)?.name)))
          void queryClientRef.current.invalidateQueries({ queryKey: ["bestie-assignment"] });
      }
    }).then((u) => (cancelled ? u() : unlistens.push(u)));
    void listen("remote-access-changed", () => void refreshRemoteAccess()).then((u) => (cancelled ? u() : unlistens.push(u)));
    void listen<{ session?: string | null }>("remote-terminal-opened", async (e) => {
      void refreshRemoteAccess();
      const prefs = readStoredNotificationSettings(pubkeyRef.current?.trim().toLowerCase() ?? "");
      if (!prefs.desktopEnabled || !prefs.eventAlertsEnabled.remote_terminal) return;
      try {
        const { isPermissionGranted, sendNotification } = await import("@tauri-apps/plugin-notification");
        if (await isPermissionGranted())
          sendNotification({
            title: "Remote terminal opened",
            body: e.payload?.session ? `Your web app opened herdr session “${e.payload.session}” on this Mac.` : "Your web app opened a shell on this Mac.",
          });
      } catch {
        /* notifications unavailable */
      }
    }).then((u) => (cancelled ? u() : unlistens.push(u)));
    return () => {
      cancelled = true;
      unsubStore();
      for (const u of unlistens) u();
    };
  }, []);
}
