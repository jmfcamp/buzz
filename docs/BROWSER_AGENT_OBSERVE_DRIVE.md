# Browser agent Observe / Drive

Status: shipped (Hula Desktop). Not OpenClaw gateway Chromium / CDP.

## Product

Every Buzz built-in browser (playground Sites, pinned sites, OS pop-outs of those) supports two grant modes:

| Mode | Human | Agent |
|------|-------|-------|
| **Off** | Full control | No session access |
| **Observe** | Drives the page | May **read** console, network (headers/status/**bodies**), nav/URL/title, DOM/a11y when available. No PHI scrub. |
| **Drive** | Sees theater cursor; input locked | Takes over navigate/click/type/scroll. |

**Take control** (chrome) → grant cleared to **Off** (simplest; no silent downgrade).

### Grant binding

- One agent per browser webview at a time.
- Grant names **which agent** (pubkey / managed id) via **which channel** + optional **thread root**.
- Entry: agent message card (“Watch this Site” / “Let agent drive”) **or** chrome Off|Observe|Drive picker (agent+thread required if not opened from a card).
- Replacing an existing grant requires explicit confirm.
- **Lifetime:** until that browser webview is **disposed/closed**. Hide does not clear; dispose/close clears.

### Non-goals

- OpenClaw `browser` tool / gateway Chromium / remote CDP.
- Cross-webview multi-agent grants.
- Persisting grants across app restarts.
- PHI redaction on Observe payloads.
- Cutting a desktop release as part of this change.

## Grant schema

Persisted in-memory (and mirrored under app data for local agent tool poll):

```json
{
  "webviewLabel": "playground-{sid}" | "pin-{id}" [| "--{window}"],
  "surface": "playground" | "pin",
  "surfaceId": "{sid|pinId}",
  "agentId": "{managed agent id or pubkey}",
  "agentPubkey": "{hex pubkey}",
  "channelId": "{channel id}",
  "threadRoot": "{event id}" | null,
  "mode": "observe" | "drive",
  "createdAtMs": 0
}
```

Rust type: `BrowserAgentGrant`. Cleared on webview dispose/close for that label (and when no sibling labels remain for the same `surfaceId`).

## Chrome

- Playground chrome + pinned-site chrome: **Off | Observe | Drive** segmented control, status chip (`Observing · {agent}` / `Driving · {agent}`), **Take control** when Drive.
- Agent+channel(+thread) picker when grant not pre-bound from a card.
- Playground card actions: **Watch** (open + Observe), **Let agent drive** (open + Drive), using the card’s conversation channel/thread and the message author’s agent when known; otherwise open picker.

## Observe data plane

Instrumentation runs **inside** the Buzz WKWebView (page script), not OpenClaw Chromium:

1. On grant Observe/Drive, Desktop injects/hooks: `console.*`, `fetch`, `XMLHttpRequest`, and records nav from existing Rust nav emitters.
2. Events land in an in-memory ring (`BrowserObserveBuffer`) and are mirrored to `{appData}/browser-agent/{label}/events.jsonl`.
3. Bound agent reads via:
   - Desktop IPC / Tauri: `browser_observe_poll` (cursor + limit)
   - Optional subscribe: Tauri event `browser-agent-observe`
   - Local MCP tools on `buzz-dev-mcp`: `browser_observe_poll` (grant-gated by agent pubkey)

**Network bodies:** captured from page-side `fetch`/XHR response text when available (size-capped). Native WKWebView request body taps without eval are not used. If a page is cross-origin opaque or uses streams we cannot clone, body may be omitted — event still carries URL/status/headers when known.

**Pins:** Observe injection is allowed only while a grant is active (exception to the pin “no eval for load classification” rule). Drive on pins uses the same grant-scoped eval path.

## Drive data plane

When `mode=drive`:

1. Human pointer/keyboard on the child webview is locked (full-page capture overlay in-page; chrome **Take control** remains usable).
2. Agent actions (`browser_drive`): `navigate` | `click` | `type` | `scroll` | `hover` — injected with a visible ghost cursor / highlight.
3. **Take control** → clear grant (Off).

Playground is primary (existing `playground_webview_eval`). Pins: grant-scoped eval only through `browser_agent` commands (not a general pin eval API).

## Agent path (local first)

Prefer **Desktop-managed / local ACP** agents that can call Desktop-side tools:

| Tool | Role |
|------|------|
| `browser_observe_poll` | Drain observe events for a granted webview |
| `browser_drive` | Perform a drive action (Drive mode only) |
| `browser_agent_grants` | List grants for this agent |

Remote Gateway agents: no CDP bridge in this change — document follow-up consent channel if remote needs the same stream.

## Security notes

- One agent per webview; replace requires confirm.
- Drive actions require live Drive grant matching caller pubkey.
- Observe has no PHI scrub (product decision).
- Never routes through OpenClaw browser debug ports (already blocked for playground URLs).
