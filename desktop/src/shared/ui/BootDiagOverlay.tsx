import * as React from "react";
import {
  bootDiagEnabled,
  bootDiagEntries,
  subscribeBootDiag,
} from "@/shared/lib/bootDiag";

/** Hidden boot timeline; shown only with `?buzzdiag=1`. */
export function BootDiagOverlay() {
  const [enabled] = React.useState(bootDiagEnabled);
  const [open, setOpen] = React.useState(true);
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(
    () => (enabled ? subscribeBootDiag(force) : undefined),
    [enabled],
  );
  if (!enabled) return null;
  const text = bootDiagEntries()
    .map((e) => `${(e.t / 1000).toFixed(2)}s ${e.tag} ${e.msg}`)
    .join("\n");
  return (
    <div
      data-testid="boot-diag"
      style={{
        position: "fixed",
        bottom: 8,
        left: 8,
        right: 8,
        zIndex: 2147483647,
        maxHeight: open ? "45vh" : 28,
        overflow: "auto",
        background: "rgba(0,0,0,0.85)",
        color: "#9f9",
        font: "10px/1.3 ui-monospace, monospace",
        padding: 6,
        borderRadius: 6,
        whiteSpace: "pre-wrap",
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ color: "#fff", marginRight: 8 }}
        type="button"
      >
        {open ? "hide" : "buzzdiag"}
      </button>
      <button
        onClick={() => void navigator.clipboard?.writeText(text)}
        style={{ color: "#fff" }}
        type="button"
      >
        copy
      </button>
      {open ? `\n${text}` : null}
    </div>
  );
}
