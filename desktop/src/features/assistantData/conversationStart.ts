// Web Assistant popup "Close Thread": the time the current conversation started. Messages at or before it are left
// out of the popup (still in the full conversation view), matching the desktop where closing a thread opens blank.
// Per device, like the desktop's own session boundary.
const KEY = "buzz.web-assistant.conversation-start.v1";

function storageKey(me: string | undefined, agent: string) {
  return `${KEY}:${(me ?? "").toLowerCase()}:${agent.toLowerCase()}`;
}

/** Unix seconds; 0 when no conversation was closed yet. */
export function readConversationStart(me: string | undefined, agent: string): number {
  try {
    const n = Number(window.localStorage.getItem(storageKey(me, agent)));
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function writeConversationStart(me: string | undefined, agent: string, at: number) {
  try {
    window.localStorage.setItem(storageKey(me, agent), String(Math.floor(at)));
  } catch {
    /* UI preference only */
  }
}
