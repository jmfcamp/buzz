// Shared permission-prompt cards (desktop and web). Managed agents launched with "Ask before using tools" write prompts
// the desktop lists; this polls them through a transport, shows a card per prompt, and when a prompt disappears without
// being answered here after the bridge's timeout (default 120 s, then it rejects), shows a calm "timed out" note in its place.

export type Prompt = {
  id: string;
  title: string;
  kind: string;
  detail: string;
  createdAt: number;
  options: { optionId: string; name: string; kind: string }[];
};
export type Pending = Prompt & { pubkey: string; agentName: string };
export type PromptsTransport = {
  /** null = can't poll right now (no Direct, page hidden, unsupported desktop). */
  poll: () => Promise<Pending[] | null>;
  respond: (p: Pending, optionId: string) => Promise<void>;
  /** A prompt seen for the first time (notifications). */
  onNew?: (p: Pending) => void;
};

const POLL_MS = 4000;
/** buzz-acp's default BUZZ_ACP_PERMISSION_TIMEOUT_S; a prompt gone after (about) this long expired rather than being answered. */
export const PROMPT_TIMEOUT_S = 120;
const EXPIRED_NOTE_MS = 20_000;

export function runningAgents(list: unknown): { pubkey: string; name: string }[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((a) => a && (a as { status?: string }).status === "running")
    .map((a) => ({ pubkey: String((a as { pubkey: string }).pubkey).toLowerCase(), name: String((a as { name?: string }).name ?? "Agent") }))
    .slice(0, 20);
}

/** Order: allow options first, then reject; labels fall back to the option kind. Every runtime-offered option is shown. */
export function buttonsFor(p: Prompt): { optionId: string; label: string; allow: boolean }[] {
  return [...p.options]
    .sort((a, b) => Number(b.kind.startsWith("allow")) - Number(a.kind.startsWith("allow")))
    .map((o) => ({ optionId: o.optionId, label: o.name || o.kind.replace(/_/g, " "), allow: o.kind.startsWith("allow") }));
}

/** Did a prompt that vanished (not answered here) expire? `nowS` in seconds. */
export function looksExpired(p: Pick<Prompt, "createdAt">, nowS: number): boolean {
  return p.createdAt > 0 && nowS - p.createdAt >= PROMPT_TIMEOUT_S - 10;
}

export function expiredNoteText(p: Pick<Pending, "agentName" | "title">): string {
  const mins = Math.round(PROMPT_TIMEOUT_S / 60);
  return `${p.agentName}'s request "${p.title}" timed out after ${mins} min with no answer, so it was declined. The agent can ask again.`;
}

const CARD_CSS =
  "background:hsl(var(--popover,0 0% 100%));color:hsl(var(--popover-foreground,0 0% 10%));border:1px solid hsl(var(--border,0 0% 85%));border-radius:12px;padding:12px;box-shadow:0 6px 24px rgba(0,0,0,.18)";

export function startPromptsUi(t: PromptsTransport): () => void {
  const answered = new Set<string>();
  const seen = new Map<string, Pending>(); // shown and not answered here
  const expired = new Map<string, { p: Pending; until: number }>();
  let root: HTMLDivElement | null = null;
  let shownKey = "";
  let current: Pending[] = [];
  const keyOf = (p: Pending) => `${p.pubkey}/${p.id}`;

  function render() {
    const now = Date.now();
    for (const [k, e] of expired) if (e.until <= now) expired.delete(k);
    const items = current.slice(0, 3);
    const notes = [...expired.values()].slice(0, 3);
    const key = `${items.map(keyOf).join(",")}|${notes.map((n) => keyOf(n.p)).join(",")}`;
    if (key === shownKey && (root || (!items.length && !notes.length))) return;
    shownKey = key;
    if (!items.length && !notes.length) {
      root?.remove();
      root = null;
      return;
    }
    if (!root) {
      root = document.createElement("div");
      root.setAttribute("data-testid", "web-permission-prompts");
      root.style.cssText =
        "position:fixed;left:50%;transform:translateX(-50%);top:calc(env(safe-area-inset-top,0px) + 12px);z-index:2147483646;width:min(92vw,440px);display:flex;flex-direction:column;gap:8px;font:14px/1.35 system-ui,sans-serif";
      document.body.appendChild(root);
    }
    const noteCards = notes.map(({ p }) => {
      const card = document.createElement("div");
      card.setAttribute("data-testid", "permission-prompt-expired");
      card.style.cssText = `${CARD_CSS};display:flex;gap:8px;align-items:flex-start`;
      const txt = document.createElement("div");
      txt.style.cssText = "flex:1;color:hsl(var(--muted-foreground,0 0% 40%))";
      txt.textContent = expiredNoteText(p);
      const x = document.createElement("button");
      x.type = "button";
      x.setAttribute("aria-label", "Dismiss");
      x.textContent = "×";
      x.style.cssText = "border:0;background:transparent;color:inherit;font-size:18px;line-height:1;cursor:pointer;padding:0 4px";
      x.onclick = () => {
        expired.delete(keyOf(p));
        render();
      };
      card.append(txt, x);
      return card;
    });
    const promptCards = items.map((p) => {
      const card = document.createElement("div");
      card.setAttribute("data-testid", "web-permission-prompt");
      card.style.cssText = CARD_CSS;
      const h = document.createElement("div");
      h.style.fontWeight = "600";
      h.textContent = `${p.agentName} wants to: ${p.title}`;
      card.appendChild(h);
      if (p.detail) {
        const d = document.createElement("pre");
        d.style.cssText = "margin:6px 0 0;max-height:120px;overflow:auto;white-space:pre-wrap;font:12px ui-monospace,monospace;opacity:.8";
        d.textContent = p.detail;
        card.appendChild(d);
      }
      const row = document.createElement("div");
      row.style.cssText = "display:flex;gap:8px;margin-top:10px;flex-wrap:wrap";
      for (const b of buttonsFor(p)) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = b.label;
        btn.setAttribute("data-option", b.optionId);
        btn.style.cssText = `padding:6px 12px;border-radius:8px;border:1px solid hsl(var(--border,0 0% 80%));cursor:pointer;${b.allow ? "background:hsl(var(--primary,220 90% 50%));color:hsl(var(--primary-foreground,0 0% 100%))" : "background:transparent;color:inherit"}`;
        btn.onclick = async () => {
          row.querySelectorAll("button").forEach((x) => ((x as HTMLButtonElement).disabled = true));
          try {
            await t.respond(p, b.optionId);
            answered.add(keyOf(p));
            seen.delete(keyOf(p));
            current = current.filter((c) => keyOf(c) !== keyOf(p));
            card.remove();
          } catch (e) {
            row.querySelectorAll("button").forEach((x) => ((x as HTMLButtonElement).disabled = false));
            const msg = (e as Error).message || "Couldn't send the answer.";
            if (/no longer pending/i.test(msg) && looksExpired(p, Date.now() / 1000)) {
              seen.delete(keyOf(p));
              current = current.filter((c) => keyOf(c) !== keyOf(p));
              expired.set(keyOf(p), { p, until: Date.now() + EXPIRED_NOTE_MS });
              shownKey = "";
              render();
              return;
            }
            h.textContent = `${p.agentName}: ${msg}`;
          }
        };
        row.appendChild(btn);
      }
      card.appendChild(row);
      return card;
    });
    root.replaceChildren(...noteCards, ...promptCards);
  }

  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const list = await t.poll().catch(() => null);
      if (list === null) {
        render();
        return;
      }
      const fresh = list.filter((p) => !answered.has(keyOf(p)));
      const ids = new Set(fresh.map(keyOf));
      const nowS = Date.now() / 1000;
      for (const [k, p] of seen) {
        if (ids.has(k)) continue;
        seen.delete(k);
        if (looksExpired(p, nowS)) expired.set(k, { p, until: Date.now() + EXPIRED_NOTE_MS });
      }
      for (const p of fresh) {
        if (!seen.has(keyOf(p))) {
          seen.set(keyOf(p), p);
          try {
            t.onNew?.(p);
          } catch {
            /* notifications are best effort */
          }
        }
      }
      current = fresh;
      render();
    } finally {
      busy = false;
    }
  };
  const iv = setInterval(() => void tick(), POLL_MS);
  const vis = () => void tick();
  document.addEventListener("visibilitychange", vis);
  void tick();
  return () => {
    clearInterval(iv);
    document.removeEventListener("visibilitychange", vis);
    root?.remove();
    root = null;
  };
}
