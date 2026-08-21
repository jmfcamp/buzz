import * as React from "react";

import { cn } from "@/shared/lib/cn";

import {
  PLAYGROUND_DEVICES,
  playgroundDeviceViewport,
  playgroundUserAgent,
  type PlaygroundDeviceId,
} from "../lib/devices";
import { DEFAULT_RESPONSIVE_VIEWPORT } from "../lib/types";
import { PLAYGROUND_DOM_PROBE_SCRIPT } from "../lib/updates";
import {
  evalPlaygroundWebview,
  playgroundWebviewBoundsAreUsable,
  setPlaygroundWebviewBounds,
  showPlaygroundWebview,
} from "../lib/webview";
import type { PlaygroundSession } from "../lib/sessions";

export type PlaygroundChromeMode = "desktop" | "responsive" | "mobile";

function readPosition(el: HTMLElement) {
  const rect = el.getBoundingClientRect();
  return { x: rect.x, y: rect.y };
}

export function PlaygroundStage({
  mode,
  session,
}: {
  mode: PlaygroundChromeMode;
  session: PlaygroundSession;
}) {
  if (mode === "mobile") {
    return <MobileDeviceMuseum session={session} />;
  }
  if (mode === "responsive") {
    return <ResponsiveStage session={session} />;
  }
  return <DesktopStage session={session} />;
}

function DesktopStage({ session }: { session: PlaygroundSession }) {
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col"
      data-testid="playground-desktop-stage"
    >
      <NativeStageHost
        hostRef={hostRef}
        session={session}
        userAgent={playgroundUserAgent("desktop")}
      />
    </div>
  );
}

function ResponsiveStage({ session }: { session: PlaygroundSession }) {
  const [width, setWidth] = React.useState(DEFAULT_RESPONSIVE_VIEWPORT.width);
  const [height, setHeight] = React.useState(
    DEFAULT_RESPONSIVE_VIEWPORT.height,
  );
  const hostRef = React.useRef<HTMLDivElement | null>(null);

  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-2"
      data-testid="playground-responsive-stage"
    >
      <div className="flex flex-wrap items-center gap-2 px-3">
        <label className="flex items-center gap-1 text-2xs text-muted-foreground">
          W
          <input
            className="w-16 rounded-md border border-border bg-background px-1 py-0.5 text-2xs text-foreground"
            data-testid="playground-responsive-width"
            min={320}
            onChange={(event) =>
              setWidth(Math.max(320, Number(event.target.value) || 320))
            }
            type="number"
            value={width}
          />
        </label>
        <span className="text-2xs text-muted-foreground">×</span>
        <label className="flex items-center gap-1 text-2xs text-muted-foreground">
          H
          <input
            className="w-16 rounded-md border border-border bg-background px-1 py-0.5 text-2xs text-foreground"
            data-testid="playground-responsive-height"
            min={320}
            onChange={(event) =>
              setHeight(Math.max(320, Number(event.target.value) || 320))
            }
            type="number"
            value={height}
          />
        </label>
      </div>
      <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden p-3">
        <div
          className="relative overflow-hidden rounded-md border border-border"
          data-testid="playground-responsive-frame"
          style={{ width, height, maxWidth: "100%" }}
        >
          <NativeStageHost
            hostRef={hostRef}
            session={session}
            userAgent={playgroundUserAgent("responsive")}
            viewport={{ width, height }}
          />
          <StageResizeHandle
            axis="x"
            onResize={(next) => setWidth(Math.max(320, next))}
            testId="playground-stage-resize"
          />
          <StageResizeHandle
            axis="y"
            onResize={(next) => setHeight(Math.max(320, next))}
            testId="playground-stage-resize-y"
          />
        </div>
      </div>
    </div>
  );
}

function StageResizeHandle({
  axis,
  onResize,
  testId,
}: {
  axis: "x" | "y";
  onResize: (next: number) => void;
  testId: string;
}) {
  const dragging = React.useRef(false);
  const origin = React.useRef({ pos: 0, size: 0 });

  React.useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (!dragging.current) return;
      const delta =
        axis === "x"
          ? event.clientX - origin.current.pos
          : event.clientY - origin.current.pos;
      onResize(origin.current.size + delta);
    };
    const onUp = () => {
      dragging.current = false;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [axis, onResize]);

  return (
    <button
      aria-label={axis === "x" ? "Resize width" : "Resize height"}
      className={
        axis === "x"
          ? "absolute inset-y-2 right-0 z-10 w-2 cursor-ew-resize rounded-full bg-border/80"
          : "absolute inset-x-2 bottom-0 z-10 h-2 cursor-ns-resize rounded-full bg-border/80"
      }
      data-testid={testId}
      onPointerDown={(event) => {
        const frame = event.currentTarget.parentElement;
        origin.current = {
          pos: axis === "x" ? event.clientX : event.clientY,
          size:
            frame instanceof HTMLElement
              ? axis === "x"
                ? frame.offsetWidth
                : frame.offsetHeight
              : 800,
        };
        dragging.current = true;
      }}
      type="button"
    />
  );
}

function MobileDeviceMuseum({ session }: { session: PlaygroundSession }) {
  const [deviceId, setDeviceId] =
    React.useState<PlaygroundDeviceId>("iphone-16");
  const [orientation, setOrientation] = React.useState<
    "portrait" | "landscape"
  >("portrait");
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const device = PLAYGROUND_DEVICES.find((item) => item.id === deviceId);
  const viewport = device
    ? playgroundDeviceViewport(device, orientation)
    : { width: 393, height: 852 };

  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-2"
      data-testid="playground-mobile-stage"
    >
      <div className="flex flex-wrap items-center gap-2 px-3">
        <select
          className="rounded-md border border-border bg-background px-2 py-1 text-xs"
          data-testid="playground-device-select"
          onChange={(event) =>
            setDeviceId(event.target.value as PlaygroundDeviceId)
          }
          value={deviceId}
        >
          {PLAYGROUND_DEVICES.map((item) => (
            <option
              data-testid={`playground-device-${item.id}`}
              key={item.id}
              value={item.id}
            >
              {item.name}
            </option>
          ))}
        </select>
        <button
          className="rounded-md border border-border px-2 py-1 text-xs"
          data-testid="playground-orientation"
          onClick={() =>
            setOrientation((value) =>
              value === "portrait" ? "landscape" : "portrait",
            )
          }
          type="button"
        >
          {orientation === "portrait" ? "Portrait" : "Landscape"}
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto p-3">
        <div
          className="overflow-hidden rounded-[1.75rem] border border-border bg-background shadow-lg"
          data-testid="playground-device-frame"
          style={{ width: viewport.width, height: viewport.height }}
        >
          <NativeStageHost
            hostRef={hostRef}
            session={session}
            userAgent={playgroundUserAgent("mobile", device)}
            viewport={viewport}
          />
        </div>
      </div>
    </div>
  );
}

function NativeStageHost({
  hostRef,
  session,
  userAgent,
  viewport,
}: {
  hostRef: React.RefObject<HTMLDivElement | null>;
  session: PlaygroundSession;
  userAgent: string;
  viewport?: { width: number; height: number };
}) {
  React.useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let opened = false;

    const sync = () => {
      if (cancelled || !hostRef.current) return;
      const position = readPosition(hostRef.current);
      const hostBox = hostRef.current.getBoundingClientRect();
      const bounds = {
        x: position.x,
        y: position.y,
        width: viewport?.width ?? hostBox.width,
        height: viewport?.height ?? hostBox.height,
      };
      if (!playgroundWebviewBoundsAreUsable(bounds)) return;
      if (!opened) {
        opened = true;
        void showPlaygroundWebview({
          sid: session.sid,
          url: session.url,
          bounds,
          userAgent,
        }).then(() =>
          evalPlaygroundWebview(session.sid, PLAYGROUND_DOM_PROBE_SCRIPT),
        );
        return;
      }
      void setPlaygroundWebviewBounds(session.sid, bounds, userAgent);
    };

    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(host);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [
    hostRef,
    session.sid,
    session.url,
    userAgent,
    viewport?.width,
    viewport?.height,
  ]);

  return (
    <div
      className={cn("h-full min-h-[12rem] w-full bg-background")}
      data-testid="playground-webview-host"
      data-user-agent={userAgent}
      data-viewport-width={viewport?.width}
      data-viewport-height={viewport?.height}
      ref={hostRef}
    />
  );
}
