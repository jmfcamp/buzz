// Runs an Assistant routine. Relay-only (works on web without Direct): every message is signed by the signed-in
// user's normal signer. The Assistant agent's own key lives with the desktop agent runtime, so the app cannot post
// as the Assistant; `assistant-prompt` instead DMs the prompt to the Assistant, which then acts on it.
import {
  getChannelMembers,
  getChannels,
  openDm,
} from "@/shared/api/tauriChannels";
import { sendChannelMessage } from "@/shared/api/tauriMessages";
import { getUsersBatch } from "@/shared/api/tauriProfiles";
import { listManagedAgents } from "@/shared/api/tauri";
import type { Channel } from "@/shared/api/types";
import { getAssistantPubkey } from "@/shared/lib/assistantIdentity";

import {
  composeChannelPost,
  defaultWakeChannel,
  type Routine,
  type RoutineRun,
  upsertRoutine,
} from "./routinesDoc";
import { updateRoutines } from "./routinesSync";

const nowSec = () => Math.floor(Date.now() / 1000);

export async function joinedStreams(): Promise<Channel[]> {
  const { channels } = await getChannels(null);
  return (channels ?? []).filter(
    (c) => c.channelType !== "dm" && !c.archivedAt,
  );
}

/** Channel members that are agents: relay role bot, NIP-OA owned profile, or one of the user's managed agents. */
export async function channelBots(
  channelId: string,
  me: string,
): Promise<{ pubkey: string; name: string }[]> {
  const members = await getChannelMembers(channelId);
  const pks = members.map((m) => m.pubkey.toLowerCase());
  const [owned, managed] = await Promise.all([
    getUsersBatch(pks)
      .then((r) => r.profiles)
      .catch(
        () =>
          ({}) as Record<
            string,
            { ownerPubkey: string | null; displayName?: string | null }
          >,
      ),
    listManagedAgents().catch(() => []),
  ]);
  const managedKeys = new Set(managed.map((a) => a.pubkey.toLowerCase()));
  return members
    .filter((m) => {
      const pk = m.pubkey.toLowerCase();
      if (pk === me) return false;
      return (
        m.isAgent ||
        m.role === "bot" ||
        managedKeys.has(pk) ||
        Boolean(
          (owned as Record<string, { ownerPubkey: string | null }>)[pk]
            ?.ownerPubkey,
        )
      );
    })
    .map((m) => {
      const pk = m.pubkey.toLowerCase();
      const prof = (owned as Record<string, { displayName?: string | null }>)[
        pk
      ];
      return {
        pubkey: pk,
        name: (m.displayName || prof?.displayName || pk.slice(0, 8)).replace(
          /\s+/g,
          "",
        ),
      };
    });
}

async function runAction(routine: Routine, me: string): Promise<string> {
  const a = routine.action;
  if (a.type === "post-to-channel") {
    const streams = await joinedStreams();
    const target = a.channelId
      ? streams.find((c) => c.id === a.channelId)
      : defaultWakeChannel(streams);
    if (!target)
      throw new Error(
        a.channelId
          ? "You're not a member of the routine's channel anymore. Pick another."
          : "Pick a channel for this routine (Edit).",
      );
    const bots = a.mentionChannelBots ? await channelBots(target.id, me) : [];
    const { content, mentionPubkeys } = composeChannelPost(a, bots);
    if (!content) throw new Error("Nothing to post.");
    await sendChannelMessage(
      target.id,
      content,
      null,
      undefined,
      mentionPubkeys,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      me,
    );
    return `Posted in #${target.name}${a.mentionChannelBots ? ` · mentioned ${bots.length} bot${bots.length === 1 ? "" : "s"}` : ""}`;
  }
  if (a.type === "assistant-prompt") {
    const assistant = getAssistantPubkey();
    if (!assistant) throw new Error("No Assistant is set up.");
    if (!a.prompt.trim()) throw new Error("The prompt is empty.");
    const { channels } = await getChannels(null);
    const dm =
      (channels ?? []).find((c) => {
        if (c.channelType !== "dm") return false;
        const ps = new Set(
          (c.participantPubkeys ?? []).map((p) => p.toLowerCase()),
        );
        return ps.size === 2 && ps.has(me) && ps.has(assistant);
      }) ?? (await openDm({ pubkeys: [assistant], expectedSignerPubkey: me }));
    await sendChannelMessage(dm.id, a.prompt.trim(), null, undefined, [
      assistant,
    ]);
    return "Sent to the Assistant";
  }
  throw new Error("This routine type isn't supported in this version.");
}

const running = new Set<string>();
export const isRoutineRunning = (id: string) => running.has(id);

/** Run and record the result (synced as lastRun). Resolves with the run record; never throws. */
export async function runRoutine(
  routine: Routine,
  me: string | undefined,
): Promise<RoutineRun> {
  const pk = me?.trim().toLowerCase();
  if (!pk) return { at: nowSec(), ok: false, detail: "Not signed in." };
  if (running.has(routine.id))
    return { at: nowSec(), ok: false, detail: "Already running." };
  running.add(routine.id);
  let run: RoutineRun;
  try {
    run = { at: nowSec(), ok: true, detail: await runAction(routine, pk) };
  } catch (e) {
    run = {
      at: nowSec(),
      ok: false,
      detail: (e instanceof Error ? e.message : String(e)).slice(0, 300),
    };
  } finally {
    running.delete(routine.id);
  }
  updateRoutines(pk, (doc, now) => {
    const cur = doc.routines[routine.id]?.routine ?? routine;
    return upsertRoutine(doc, { ...cur, lastRun: run }, now);
  });
  return run;
}
