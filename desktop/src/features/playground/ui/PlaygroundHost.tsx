import * as React from "react";
import { useLocation } from "@tanstack/react-router";

import { deriveShellRoute } from "@/app/AppShell.helpers";

import { usePlaygroundSessions } from "../hooks";
import { playgroundConversationFromRoute } from "../lib/conversation";
import { usePlaygroundRuntime } from "../lib/runtime";
import { PlaygroundOverlay } from "./PlaygroundOverlay";

export function PlaygroundHost() {
  const { sessions, overlaySid } = usePlaygroundSessions();
  usePlaygroundRuntime();
  const location = useLocation();
  const conversation = React.useMemo(() => {
    const route = deriveShellRoute(location.pathname);
    const search = location.search as {
      thread?: unknown;
      threadRootId?: unknown;
    };
    const thread = search.threadRootId ?? search.thread;
    return playgroundConversationFromRoute({
      selectedView: route.selectedView,
      selectedChannelId: route.selectedChannelId,
      threadId: typeof thread === "string" ? thread : null,
    });
  }, [location.pathname, location.search]);
  const session = overlaySid ? (sessions.get(overlaySid) ?? null) : null;
  if (!session) return null;
  return <PlaygroundOverlay conversation={conversation} session={session} />;
}
