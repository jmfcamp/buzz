// Web "Open with Buzz" keep-alive: every opened in-Buzz pin keeps its iframe mounted (hidden when not on its route) so
// coming back resumes the page without a reload. Capped at MAX_LIVE (least recently shown dropped). The host lives in
// the app shell, outside the router outlet; the /pins/<id> route only renders a slot whose rect the visible frame
// covers (position:fixed), because re-parenting an iframe would reload it.
import * as React from "react";

import { usePinnedSites } from "../hooks";
import { useWebPinOpenInBuzz } from "../lib/webPinOpen";
import { WebPinnedSiteFrame } from "./WebPinnedSiteFrame";

const MAX_LIVE = 5;

type SlotState = { pinId: string; el: HTMLElement } | null;
let slot: SlotState = null;
const slotListeners = new Set<() => void>();
function setSlot(next: SlotState) {
  slot = next;
  for (const f of slotListeners) f();
}

/** Rendered by the web /pins/<id> route for an in-Buzz pin: marks where the live frame should show. */
export function WebPinFrameSlot({ pinId }: { pinId: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useLayoutEffect(() => {
    if (ref.current) setSlot({ pinId, el: ref.current });
    return () => {
      if (slot?.pinId === pinId) setSlot(null);
    };
  }, [pinId]);
  return <div className="h-full min-h-0 w-full flex-1" data-testid="web-pin-frame-slot" ref={ref} />;
}

function useSlot(): SlotState {
  return React.useSyncExternalStore(
    (cb) => {
      slotListeners.add(cb);
      return () => void slotListeners.delete(cb);
    },
    () => slot,
    () => null,
  );
}

function useRect(el: HTMLElement | null): DOMRect | null {
  const [rect, setRect] = React.useState<DOMRect | null>(null);
  React.useLayoutEffect(() => {
    if (!el) {
      setRect(null);
      return;
    }
    let raf = 0;
    const read = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setRect(el.getBoundingClientRect()));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    window.addEventListener("resize", read);
    window.visualViewport?.addEventListener("resize", read);
    window.visualViewport?.addEventListener("scroll", read);
    const iv = window.setInterval(read, 500); // layout shifts that don't resize the slot (sidebar slide, keyboard)
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", read);
      window.visualViewport?.removeEventListener("resize", read);
      window.visualViewport?.removeEventListener("scroll", read);
      window.clearInterval(iv);
    };
  }, [el]);
  return rect;
}

export function WebPinFrameHost() {
  const current = useSlot();
  const { pins } = usePinnedSites();
  const [live, setLive] = React.useState<string[]>([]);
  React.useEffect(() => {
    if (!current) return;
    setLive((prev) => [current.pinId, ...prev.filter((id) => id !== current.pinId)].slice(0, MAX_LIVE));
  }, [current]);
  const rect = useRect(current?.el ?? null);
  return (
    <>
      {live.map((id) => {
        const pin = pins.find((p) => p.id === id);
        if (!pin) return null;
        return (
          <LiveFrame
            key={id}
            pin={pin}
            rect={current?.pinId === id ? rect : null}
            onDisabled={() => setLive((prev) => prev.filter((x) => x !== id))}
          />
        );
      })}
    </>
  );
}

function LiveFrame({
  pin,
  rect,
  onDisabled,
}: {
  pin: Parameters<typeof WebPinnedSiteFrame>[0]["pin"];
  rect: DOMRect | null;
  onDisabled: () => void;
}) {
  const inBuzz = useWebPinOpenInBuzz(pin.id);
  React.useEffect(() => {
    if (!inBuzz) onDisabled(); // turned off in settings: drop the live frame
  }, [inBuzz, onDisabled]);
  const visible = !!rect && rect.width > 0 && rect.height > 0;
  return (
    <div
      aria-hidden={!visible}
      data-testid={`web-pin-live-${pin.id}`}
      style={
        visible
          ? { position: "fixed", left: rect.left, top: rect.top, width: rect.width, height: rect.height, zIndex: 40 }
          : { position: "fixed", left: 0, top: 0, width: 1, height: 1, visibility: "hidden", pointerEvents: "none" }
      }
    >
      <WebPinnedSiteFrame pin={pin} />
    </div>
  );
}
