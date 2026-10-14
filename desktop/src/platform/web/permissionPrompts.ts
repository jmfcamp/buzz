// Web: answer managed-agent permission prompts over Direct. Only agents launched with BUZZ_ACP_PERMISSION_MODE=ask on a
// desktop that has `list_permission_prompts` raise them; an older desktop answers unknown_op once and polling stops for the
// session (no UI, no errors). The desktop redacts titles/details before they leave it. Cards + expiry notes: promptsUi.ts.
import { proxyCmd, proxyDirectLive, relaySnapshotAgents } from "@/features/bridge/remoteCmd";
import { type Pending, type Prompt, runningAgents, startPromptsUi } from "@/features/agents/permissionPrompts/promptsUi";

export { buttonsFor, runningAgents, type Prompt } from "@/features/agents/permissionPrompts/promptsUi";

let unsupported = false;

async function poll(): Promise<Pending[] | null> {
  if (unsupported || !proxyDirectLive() || document.visibilityState !== "visible") return null;
  const out: Pending[] = [];
  for (const a of runningAgents(relaySnapshotAgents())) {
    try {
      const list = await proxyCmd<Prompt[]>("list_permission_prompts", { pubkey: a.pubkey });
      for (const p of list ?? []) out.push({ ...p, pubkey: a.pubkey, agentName: a.name });
    } catch (e) {
      if ((e as { code?: string }).code === "unknown_op") {
        unsupported = true;
        return null;
      }
      return null; // a failed read must not look like "every prompt vanished" (that would fake expiries)
    }
  }
  return out;
}

let started = false;
export function startPermissionPrompts() {
  if (started) return;
  started = true;
  startPromptsUi({
    poll,
    respond: (p, optionId) => proxyCmd("respond_permission_prompt", { pubkey: p.pubkey, requestId: p.id, optionId }).then(() => undefined),
  });
}
