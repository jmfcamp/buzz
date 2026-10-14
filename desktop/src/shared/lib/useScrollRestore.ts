// Phone: keep a list screen's scroll position across unmount (open a channel, swipe/tap back). The position is saved on
// every scroll (so the history-pop / swipe-back path, which unmounts without a "leave" hook, is covered too) and
// restored once the list has rendered tall enough, retrying for a short while as rows stream in.
import * as React from "react";

const saved = new Map<string, number>();

export function useScrollRestore(
  key: string | null,
  ref: React.RefObject<HTMLElement | null>,
): void {
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!key || !el) return;
    const target = saved.get(key) ?? 0;
    let restoring = target > 0;
    let frame = 0;
    const started = performance.now();
    const tryRestore = () => {
      if (!restoring) return;
      if (el.scrollHeight - el.clientHeight >= target - 1) {
        el.scrollTop = target;
        restoring = false;
        return;
      }
      if (performance.now() - started > 1500) {
        el.scrollTop = target;
        restoring = false;
        return;
      }
      frame = window.requestAnimationFrame(tryRestore);
    };
    tryRestore();
    const stopRestoring = () => {
      restoring = false;
    };
    const onScroll = () => {
      if (!restoring) saved.set(key, el.scrollTop);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("touchstart", stopRestoring, { passive: true });
    el.addEventListener("wheel", stopRestoring, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      if (!restoring) saved.set(key, el.scrollTop);
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("touchstart", stopRestoring);
      el.removeEventListener("wheel", stopRestoring);
    };
  }, [key, ref]);
}
