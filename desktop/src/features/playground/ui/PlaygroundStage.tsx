import * as React from "react";

import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/cn";

import {
  PLAYGROUND_DEVICES,
  playgroundDeviceViewport,
  type PlaygroundDeviceId,
} from "../lib/devices";
import { DESKTOP_STAGE_PRESETS } from "../lib/types";
import {
  playgroundWebviewBoundsAreUsable,
  setPlaygroundWebviewBounds,
  showPlaygroundWebview,
} from "../lib/webview";
import type { PlaygroundSession } from "../lib/sessions";

export type PlaygroundChromeMode = "desktop" | "mobile";

function readBounds(el: HTMLElement) {
  const rect = el.getBoundingClientRect();
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  };
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
  return <DesktopStage session={session} />;
}

function DesktopStage({ session }: { session: PlaygroundSession }) {
  const [width, setWidth] = React.useState<number | null>(null);
  const hostRef = React.useRef<HTMLDivElement | null>(null);

  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-2"
      data-testid="playground-desktop-stage"
    >
      <div className="flex flex-wrap items-center gap-1 px-1">
        {DESKTOP_STAGE_PRESETS.map((preset) => (
          <Button
            data-testid={`playground-preset-${preset}`}
            key={preset}
            onClick={() => setWidth(preset)}
            size="xs"
            type="button"
            variant={width === preset ? "secondary" : "ghost"}
          >
            {preset}
          </Button>
        ))}
      </div>
      <div className="relative min-h-0 min-w-0 flex-1">
        <div
          className="absolute inset-y-0 left-0"
          style={width ? { width, maxWidth: "100%" } : { right: 0 }}
        >
          <NativeStageHost hostRef={hostRef} session={session} />
        </div>
        <StageResizeHandle onResize={(next) => setWidth(Math.max(320, next))} />
      </div>
    </div>
  );
}

function StageResizeHandle({
  onResize,
}: {
  onResize: (width: number) => void;
}) {
  const dragging = React.useRef(false);
  const origin = React.useRef({ x: 0, width: 0 });

  React.useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (!dragging.current) return;
      onResize(origin.current.width + (event.clientX - origin.current.x));
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
  }, [onResize]);

  return (
    <button
      aria-label="Resize playground stage"
      className="absolute inset-y-8 right-0 z-10 w-2 cursor-ew-resize rounded-full bg-border/80"
      data-testid="playground-stage-resize"
      onPointerDown={(event) => {
        const stage = event.currentTarget.previousElementSibling;
        origin.current = {
          x: event.clientX,
          width: stage instanceof HTMLElement ? stage.offsetWidth : 800,
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
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-auto"
      data-testid="playground-mobile-stage"
    >
      <div className="flex flex-wrap items-center gap-1 px-1">
        {PLAYGROUND_DEVICES.map((item) => (
          <Button
            data-testid={`playground-device-${item.id}`}
            key={item.id}
            onClick={() => setDeviceId(item.id)}
            size="xs"
            type="button"
            variant={deviceId === item.id ? "secondary" : "ghost"}
          >
            {item.name}
          </Button>
        ))}
        <Button
          data-testid="playground-orientation"
          onClick={() =>
            setOrientation((value) =>
              value === "portrait" ? "landscape" : "portrait",
            )
          }
          size="xs"
          type="button"
          variant="outline"
        >
          {orientation === "portrait" ? "Portrait" : "Landscape"}
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-3">
        <div
          className="overflow-hidden rounded-[1.75rem] border border-border bg-background shadow-lg"
          data-testid="playground-device-frame"
          style={{ width: viewport.width, height: viewport.height }}
        >
          <NativeStageHost hostRef={hostRef} session={session} />
        </div>
      </div>
    </div>
  );
}

function NativeStageHost({
  hostRef,
  session,
}: {
  hostRef: React.RefObject<HTMLDivElement | null>;
  session: PlaygroundSession;
}) {
  React.useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let opened = false;

    const sync = () => {
      if (cancelled || !hostRef.current) return;
      const bounds = readBounds(hostRef.current);
      if (!playgroundWebviewBoundsAreUsable(bounds)) return;
      if (!opened) {
        opened = true;
        void showPlaygroundWebview({
          sid: session.sid,
          url: session.url,
          bounds,
        });
        return;
      }
      void setPlaygroundWebviewBounds(session.sid, bounds);
    };

    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(host);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [hostRef, session.sid, session.url]);

  return (
    <div
      className={cn("h-full min-h-[12rem] w-full bg-background")}
      data-testid="playground-webview-host"
      ref={hostRef}
    />
  );
}
