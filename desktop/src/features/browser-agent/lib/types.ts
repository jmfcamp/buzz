export type BrowserAgentMode = "observe" | "drive";

export type BrowserAgentSurface = "playground" | "pin";

export type BrowserAgentGrant = {
  webviewLabel: string;
  surface: BrowserAgentSurface;
  surfaceId: string;
  agentId: string;
  agentPubkey: string;
  channelId: string;
  threadRoot?: string | null;
  mode: BrowserAgentMode;
  /** Drive only: human temporarily unlocked the page; grant stays Drive. */
  userHasControl?: boolean;
  createdAtMs: number;
};

export type ObserveEvent = {
  id: number;
  webviewLabel: string;
  kind: string;
  atMs: number;
  payload?: unknown;
};

export type ObservePollResult = {
  events: ObserveEvent[];
  grant: BrowserAgentGrant;
};

export type DriveAction = {
  /** Use `kind` (not `type`): navigate|click|type|scroll|hover|key|waitFor */
  kind: string;
  id?: string;
  url?: string;
  x?: number;
  y?: number;
  text?: string;
  selector?: string;
  dx?: number;
  dy?: number;
  key?: string;
  urlContains?: string;
  timeoutMs?: number;
};

export type DriveHit = {
  tag: string;
  role?: string;
  name?: string;
};

export type DriveActionResult = {
  id: string;
  ok: boolean;
  kind: string;
  hit?: DriveHit;
  url?: string;
  error?: string;
  message?: string;
};

export type GrantSetInput = {
  surface: BrowserAgentSurface;
  surfaceId: string;
  agentId: string;
  agentPubkey: string;
  channelId: string;
  threadRoot?: string | null;
  mode: BrowserAgentMode;
  allowReplace?: boolean;
  windowLabel?: string;
};
