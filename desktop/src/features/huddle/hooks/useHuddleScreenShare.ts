import * as React from "react";

import {
  acquireDisplayMedia,
  HuddleScreenShareSession,
  stopMediaStreamTracks,
  type ScreenShareRemote,
} from "../lib/screenShareSession";
import { isShareBlockedByOther } from "../lib/screenSharePolicy";
import {
  mintScreenShareToken,
  stopScreenShareSlot,
  type ScreenTokenResponse,
} from "../lib/screenShareToken";

export type HuddleScreenShareState = {
  /** False when relay has no LiveKit config — hide Share. */
  available: boolean | null;
  connecting: boolean;
  sharing: boolean;
  remoteStream: MediaStream | null;
  localPreviewStream: MediaStream | null;
  currentSharer: string | null;
  error: string | null;
  shareBlocked: boolean;
  startShare: () => Promise<void>;
  stopShare: () => Promise<void>;
  clearError: () => void;
};

/** User dismissed getDisplayMedia, or LiveKit aborted a superseded connect. */
function isBenignScreenShareAbort(error: unknown): boolean {
  if (error == null) return false;
  if (typeof DOMException !== "undefined" && error instanceof DOMException) {
    if (error.name === "AbortError") return true;
  }
  if (error instanceof Error) {
    if (error.name === "AbortError") return true;
    const msg = error.message.toLowerCase();
    if (msg.includes("operation was aborted")) return true;
    if (msg.includes("connection attempt aborted")) return true;
    if (msg.includes("client initiated disconnect")) return true;
    if (msg.includes("signal connection aborted")) return true;
    // LiveKit ConnectionError.cancelled(...)
    if (
      error.name === "ConnectionError" &&
      (msg.includes("abort") || msg.includes("cancel"))
    ) {
      return true;
    }
  }
  return false;
}

function makeSessionCallbacks(setters: {
  setRemoteStream: (stream: MediaStream | null) => void;
  setLocalPreviewStream: (stream: MediaStream | null) => void;
  setSharing: (sharing: boolean) => void;
  setCurrentSharer: (pubkey: string | null) => void;
}): ConstructorParameters<typeof HuddleScreenShareSession>[0] {
  return {
    onRemoteChanged: (remote: ScreenShareRemote | null) => {
      setters.setRemoteStream(remote?.stream ?? null);
    },
    onLocalPreviewChanged: (stream) => {
      // Non-null: session owns a published local track. Null during
      // reconnect must not clear an early pre-connect preview.
      if (stream) {
        setters.setLocalPreviewStream(stream);
        setters.setSharing(true);
      }
    },
    onCurrentSharerChanged: (pubkey) => {
      setters.setCurrentSharer(pubkey);
    },
  };
}

/**
 * Connects a LiveKit subscriber when a huddle is active and LiveKit is
 * configured. Publishes at most one local screen track.
 *
 * Share stays visible after a PC/connect failure: only relay
 * `screen_share_unavailable` hides the control. A connect generation
 * rejects stale subscriber errors when startShare takes over the room.
 * Benign AbortErrors (picker dismiss, superseded LiveKit connect) are
 * logged only — never shown via setError.
 */
export function useHuddleScreenShare(args: {
  active: boolean;
  channelId: string | null | undefined;
  parentChannelId: string | null | undefined;
  selfPubkey: string | null | undefined;
}): HuddleScreenShareState {
  const { active, channelId, parentChannelId, selfPubkey } = args;
  const [available, setAvailable] = React.useState<boolean | null>(null);
  const [connecting, setConnecting] = React.useState(false);
  const [sharing, setSharing] = React.useState(false);
  const [remoteStream, setRemoteStream] = React.useState<MediaStream | null>(
    null,
  );
  const [localPreviewStream, setLocalPreviewStream] =
    React.useState<MediaStream | null>(null);
  const [currentSharer, setCurrentSharer] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const sessionRef = React.useRef<HuddleScreenShareSession | null>(null);
  /** Bumped on effect cleanup and when startShare claims the room. */
  const connectGenRef = React.useRef(0);
  const channelRef = React.useRef(channelId);
  channelRef.current = channelId;
  const parentRef = React.useRef(parentChannelId);
  parentRef.current = parentChannelId;

  const sessionCallbacks = React.useMemo(
    () =>
      makeSessionCallbacks({
        setRemoteStream,
        setLocalPreviewStream,
        setSharing,
        setCurrentSharer,
      }),
    [],
  );

  const teardown = React.useCallback(async () => {
    const session = sessionRef.current;
    sessionRef.current = null;
    if (session) {
      await session.disconnect();
    }
    const channel = channelRef.current;
    if (channel) {
      await stopScreenShareSlot({
        channelId: channel,
        parentChannelId: parentRef.current,
      });
    }
    setSharing(false);
    setRemoteStream(null);
    setLocalPreviewStream(null);
    setCurrentSharer(null);
    setConnecting(false);
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    const gen = ++connectGenRef.current;

    async function connectSubscriber() {
      if (!active || !channelId) {
        await teardown();
        setAvailable(null);
        return;
      }
      setConnecting(true);
      setError(null);
      try {
        const minted = await mintScreenShareToken({
          channelId,
          parentChannelId: parentRef.current,
          intent: "subscribe",
        });
        if (cancelled || gen !== connectGenRef.current) return;
        if ("unavailable" in minted && minted.unavailable) {
          setAvailable(false);
          setConnecting(false);
          return;
        }
        // Mint succeeded → LiveKit is configured. Keep Share visible even if
        // the peer connection later times out (user can retry via Share).
        setAvailable(true);
        const token = minted as ScreenTokenResponse;
        setCurrentSharer(token.current_sharer);
        // startShare may have installed a publish session while we minted.
        if (sessionRef.current) {
          return;
        }
        const session = new HuddleScreenShareSession(sessionCallbacks);
        sessionRef.current = session;
        await session.connect(token.url, token.token);
        if (cancelled || gen !== connectGenRef.current) return;
      } catch (e) {
        if (cancelled || gen !== connectGenRef.current) return;
        // Superseded subscribe connect / user-gesture abort: keep Share, no banner.
        if (isBenignScreenShareAbort(e)) {
          console.debug("[huddle] screen-share subscriber connect aborted", e);
          if (sessionRef.current && !sessionRef.current.isConnected) {
            const dead = sessionRef.current;
            sessionRef.current = null;
            void dead.disconnect();
          }
          return;
        }
        // PC/auth/network failures must not hide Share — only true unavailable
        // above does. Stale subscriber rejects after startShare reconnect are
        // ignored via connectGenRef.
        setError(e instanceof Error ? e.message : String(e));
        if (sessionRef.current && !sessionRef.current.isConnected) {
          const dead = sessionRef.current;
          sessionRef.current = null;
          void dead.disconnect();
        }
      } finally {
        if (!cancelled && gen === connectGenRef.current) {
          setConnecting(false);
        }
      }
    }

    void connectSubscriber();
    return () => {
      cancelled = true;
      connectGenRef.current += 1;
      void teardown();
    };
    // parentChannelId is read via parentRef so parent filling in after join
    // does not tear down a healthy LiveKit PC and hide Share on reconnect.
  }, [active, channelId, sessionCallbacks, teardown]);

  const startShare = React.useCallback(async () => {
    if (!channelId) return;
    setError(null);
    // First await MUST be getDisplayMedia — WebKit/WKWebView needs a user gesture.
    let acquired: MediaStream | null = null;
    try {
      acquired = await acquireDisplayMedia();
      // Local preview is independent of LiveKit publish — show it immediately
      // even if mint/connect later fails.
      setLocalPreviewStream(acquired);
      setSharing(true);
      const minted = await mintScreenShareToken({
        channelId,
        parentChannelId: parentRef.current,
        intent: "publish",
      });
      if ("unavailable" in minted && minted.unavailable) {
        stopMediaStreamTracks(acquired);
        acquired = null;
        setLocalPreviewStream(null);
        setSharing(false);
        setAvailable(false);
        setError(minted.reason);
        return;
      }
      const token = minted as ScreenTokenResponse;
      setAvailable(true);
      setCurrentSharer(token.current_sharer ?? selfPubkey ?? null);
      // Invalidate in-flight subscriber connect so its catch cannot hide Share
      // after we reclaim the same session for publish.
      connectGenRef.current += 1;
      let session = sessionRef.current;
      if (!session) {
        session = new HuddleScreenShareSession(sessionCallbacks);
        sessionRef.current = session;
      }
      // Reconnect with the publish-capable token — subscribe JWTs cannot publish.
      await session.connect(token.url, token.token);
      await session.startShare(acquired);
      acquired = null; // ownership transferred to session
      setSharing(true);
    } catch (e) {
      try {
        await sessionRef.current?.stopShare();
      } catch {
        /* best-effort */
      }
      stopMediaStreamTracks(acquired);
      setLocalPreviewStream(null);
      setSharing(false);
      // Picker dismiss / superseded LiveKit connect — not a user-facing failure.
      if (isBenignScreenShareAbort(e)) {
        console.debug("[huddle] screen-share start aborted", e);
        return;
      }
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [channelId, selfPubkey, sessionCallbacks]);

  const stopShare = React.useCallback(async () => {
    setError(null);
    try {
      await sessionRef.current?.stopShare();
      if (channelId) {
        await stopScreenShareSlot({
          channelId,
          parentChannelId: parentRef.current,
        });
      }
      setCurrentSharer(null);
      setLocalPreviewStream(null);
      setSharing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [channelId]);

  const shareBlocked = isShareBlockedByOther({
    selfPubkey,
    currentSharer: sharing ? selfPubkey : currentSharer,
  });

  return {
    available,
    connecting,
    sharing,
    remoteStream,
    localPreviewStream,
    currentSharer,
    error,
    shareBlocked,
    startShare,
    stopShare,
    clearError: () => setError(null),
  };
}
