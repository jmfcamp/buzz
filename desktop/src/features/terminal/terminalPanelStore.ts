import * as React from "react";

import { getTermPreferences } from "./termPreferences.ts";

export type TerminalPanelMode = "closed" | "docked" | "maximized";

/** Which tabs the panel shows.
 * - `channel`: in-channel / ⌘J — only sessions for the active channel.
 * - `all`: left-nav Buzz Term — every live Term tab, with channel provenance.
 */
export type TerminalTabScope = "channel" | "all";

type Snapshot = {
  mode: TerminalPanelMode;
  tabScope: TerminalTabScope;
  sessionChannelIds: ReadonlySet<string>;
};

let snapshot: Snapshot = {
  mode: "closed",
  tabScope: "channel",
  sessionChannelIds: new Set(),
};
const listeners = new Set<() => void>();

function publish(next: Snapshot) {
  snapshot = next;
  for (const listener of listeners) listener();
}

export function setTerminalPanelMode(mode: TerminalPanelMode) {
  if (snapshot.mode === mode) return;
  publish({ ...snapshot, mode });
}

/** Open or switch Term with an explicit tab scope (channel vs global). */
export function openTerminalPanel(
  mode: Exclude<TerminalPanelMode, "closed">,
  tabScope: TerminalTabScope,
) {
  if (snapshot.mode === mode && snapshot.tabScope === tabScope) return;
  publish({ ...snapshot, mode, tabScope });
}

export function setTerminalTabScope(tabScope: TerminalTabScope) {
  if (snapshot.tabScope === tabScope) return;
  publish({ ...snapshot, tabScope });
}

/** In-channel / ⌘J: channel-scoped. Opens with Settings open-mode; closes when open. */
export function toggleTerminalPanel() {
  if (snapshot.mode === "closed") {
    openTerminalPanel(getTermPreferences().openMode, "channel");
    return;
  }
  setTerminalPanelMode("closed");
}

/**
 * Left-nav Buzz Term is an exclusive surface (tabScope "all"). Leaving for
 * another primary-nav row or a channel must clear highlight + hide the panel.
 * Channel-scoped Term (⌘J / in-channel) uses tabScope "channel" and is left alone.
 */
export function leaveLeftNavBuzzTerm() {
  if (snapshot.tabScope !== "all" || snapshot.mode === "closed") return;
  setTerminalPanelMode("closed");
}

/** True when the left-nav Buzz Term row should show as selected. */
export function isLeftNavBuzzTermActive(
  panel: Pick<Snapshot, "mode" | "tabScope"> = snapshot,
) {
  return panel.mode !== "closed" && panel.tabScope === "all";
}

/**
 * Primary-nav Inbox/Agents/Browsers/etc. highlight. Left-nav Buzz Term is a
 * peer exclusive destination — when it is active, prior rows must not stay
 * selected (opening Term does not change the URL the way Agents clears Browsers).
 */
export function isPrimaryNavRowActive(
  rowSelected: boolean,
  panel: Pick<Snapshot, "mode" | "tabScope"> = snapshot,
) {
  return rowSelected && !isLeftNavBuzzTermActive(panel);
}

/** Close left-nav Buzz Term (if open), then run a destination select. */
export function leaveLeftNavBuzzTermThen(select: () => void): () => void {
  return () => {
    leaveLeftNavBuzzTerm();
    select();
  };
}

export function setTerminalSessionChannels(channelIds: Iterable<string>) {
  const next = new Set(channelIds);
  if (
    next.size === snapshot.sessionChannelIds.size &&
    [...next].every((id) => snapshot.sessionChannelIds.has(id))
  )
    return;
  publish({ ...snapshot, sessionChannelIds: next });
}

export function useTerminalPanel() {
  return React.useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => snapshot,
  );
}

export function resetTerminalPanelForTests() {
  snapshot = {
    mode: "closed",
    tabScope: "channel",
    sessionChannelIds: new Set(),
  };
}

export function getTerminalPanelSnapshotForTests() {
  return snapshot;
}
