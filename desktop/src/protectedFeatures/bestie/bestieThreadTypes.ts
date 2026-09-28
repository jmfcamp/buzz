/** Threads Bestie has joined — tracked for Summarize + history. */

import type { BestieListScope } from "./bestieListTypes";

export type BestieThreadScope = BestieListScope;

export type BestieTrackedThread = {
  addedAt: number;
  authorName: string | null;
  channelId: string;
  channelName: string | null;
  /** Composite id: `${channelId}:${rootEventId}` */
  id: string;
  lastActiveAt: number;
  lastSummary: string | null;
  lastSummaryAt: number | null;
  /** Short preview from the message that enrolled Bestie. */
  preview: string;
  rootEventId: string;
};

export type BestieThreadPendingSummarize = {
  startedAt: number;
  threadId: string;
};

export type BestieThreadState = {
  pendingSummarize: BestieThreadPendingSummarize | null;
  threads: BestieTrackedThread[];
  version: 1;
};

export type BestieThreadUpsertInput = {
  authorName?: string | null;
  channelId: string;
  channelName?: string | null;
  preview: string;
  rootEventId: string;
};
