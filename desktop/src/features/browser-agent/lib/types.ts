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
  kind: string;
  url?: string;
  x?: number;
  y?: number;
  text?: string;
  selector?: string;
  dx?: number;
  dy?: number;
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
