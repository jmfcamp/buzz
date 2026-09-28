# Bestie Coffee

RHS category that stores `/hula-coffee` briefing runs.

## Skill

- Skill lives on JM’s Mac at `~/.claude/skills/hula-coffee/SKILL.md` (not in this repo).
- Desktop invokes it by sending a **top-level** Bestie DM turn:
  ```
  [Bestie coffee]

  /hula-coffee
  ```
- Same path for scheduled morning runs and the **Brew** button.

## Schedule

- Default **08:00 local** (`Date#setHours` — America/Phoenix on JM’s machine).
- Prefs on `BestieCoffeeState.prefs` `{ hour, minute }` for a later settings UI.
- Fires only when relay presence is **`online`** (not away/offline).
- At most one **scheduled** run per local calendar day.
- Brew is manual, shares the brewing lock, and can run any time (unless a coffee turn is live).

## Brewing UI (live ACP turn)

Do **not** treat a sticky `pendingRun` spinner or ACP 👀 (“seen”) alone as brewing.

While `/hula-coffee` is actually in flight:

1. **Disable Brew**.
2. Show **🤔…** on the Coffee RHS tab and sheet (thinking face + ellipsis), not eyes-only.
3. Live = ACP agent-working on the Assistant DM for an open coffee turn, or the short post-start grace while the turn is still queued.

Abandoned `pendingRun` locks clear after a stale idle timeout so Brew cannot lie forever.

## Storage

`buzz-bestie-coffee.v1:<relay>:<owner>:<agent>` — entries `{ id, ranAt, brief, fullOutput, source }`, `pendingRun` for Brewing UI, `lastScheduledDayKey`.

## Product rules

- Coffee / Jobs / Reminder notifies post with `parentEventId: null` (new top-level messages, never thread replies).
