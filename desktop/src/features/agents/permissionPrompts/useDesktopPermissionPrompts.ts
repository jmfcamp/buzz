// Desktop: show managed-agent permission prompts in the app (until now only the web showed them), notify natively when one
// is waiting (Settings → Notifications → Approvals), and publish a content-free "approval waiting" nudge to the relay so the
// relay's push service wakes the member's phones/browsers (existing `needs_action` web-push class, kind 46010 p-tagged to the
// owner). Tapping the push opens the app, where the web shows the same card over Direct.
import * as React from "react";

import { invoke, isTauri } from "@tauri-apps/api/core";

import { relayClient } from "@/shared/api/relayClient";
import { listManagedAgents, signRelayEvent } from "@/shared/api/tauri";
import { sendDesktopNotification } from "@/features/notifications/lib/desktop";
import { type Pending, type Prompt, runningAgents, startPromptsUi } from "./promptsUi";

/** Kind 46010 (approval requested): already a `needs_action` push class, Inbox "Approvals" item and desktop feed alert. */
export const KIND_APPROVAL_REQUESTED = 46010;
/** Marks our nudge so the desktop feed notifier skips it (the desktop already notified natively from the prompt itself). */
export const PROMPT_NUDGE_TAG = "buzz-permission-prompt";

export function buildPromptNudge(owner: string, p: Pick<Pending, "pubkey" | "agentName" | "id">) {
  return {
    kind: KIND_APPROVAL_REQUESTED,
    // Content-free beyond the agent's name: channel-less events are readable by other members, and tool details can carry secrets.
    content: `${p.agentName} is waiting for your approval.`,
    tags: [
      ["p", owner],
      ["agent", p.pubkey],
      [PROMPT_NUDGE_TAG, p.id],
      ["expiration", String(Math.floor(Date.now() / 1000) + 600)],
    ],
  };
}

export function useDesktopPermissionPrompts(
  ownerPubkey: string | undefined,
  approvalsAlertOn: () => boolean,
): void {
  const alertRef = React.useRef(approvalsAlertOn);
  alertRef.current = approvalsAlertOn;
  React.useEffect(() => {
    if (!isTauri() || !ownerPubkey) return;
    const owner = ownerPubkey.toLowerCase();
    return startPromptsUi({
      poll: async () => {
        const agents = runningAgents(await listManagedAgents());
        const out: Pending[] = [];
        for (const a of agents) {
          const list = await invoke<Array<Prompt & { created_at?: number }>>("list_permission_prompts", { pubkey: a.pubkey });
          for (const p of list ?? [])
            out.push({ ...p, createdAt: p.createdAt ?? p.created_at ?? 0, pubkey: a.pubkey, agentName: a.name });
        }
        return out;
      },
      respond: (p, optionId) => invoke("respond_permission_prompt", { pubkey: p.pubkey, requestId: p.id, optionId }),
      onNew: (p) => {
        if (alertRef.current())
          void sendDesktopNotification({ title: `${p.agentName} needs your approval`, body: p.title }).catch(() => false);
        void (async () => {
          const ev = await signRelayEvent({ ...buildPromptNudge(owner, p), allowSelfTagging: true });
          await relayClient.publishEvent(ev, "Timed out sending the approval push.", "Couldn't send the approval push.");
        })().catch((e) => console.debug("[permission prompts] push nudge not sent:", e));
      },
    });
  }, [ownerPubkey]);
}
