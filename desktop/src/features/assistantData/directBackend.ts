// The desktop Assistant registers here so Direct commands (features/bridge/directCmd.ts) can read its jobs, coffee
// chats, scratchpad and threads and act on them. Those features keep running on the desktop (its localStorage is
// the source of truth); the web only sees them over Direct.
export type AssistantDataKind = "jobs" | "coffee" | "scratch" | "threads";
export const ASSISTANT_DATA_KINDS: readonly AssistantDataKind[] = [
  "jobs",
  "coffee",
  "scratch",
  "threads",
];

export type AssistantDirectBackend = {
  relayUrl: string;
  ownerPubkey: string;
  get: (kind: AssistantDataKind) => unknown;
  act: (
    kind: AssistantDataKind,
    action: string,
    payload: Record<string, unknown>,
  ) => void | Promise<void>;
};

let backend: AssistantDirectBackend | null = null;

export function setAssistantDirectBackend(next: AssistantDirectBackend | null) {
  backend = next;
}

export function getAssistantDirectBackend(): AssistantDirectBackend | null {
  return backend;
}
