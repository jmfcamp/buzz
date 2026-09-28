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
- Brew is manual, shares the brewing lock, and can run any time.

## Storage

`buzz-bestie-coffee.v1:<relay>:<owner>:<agent>` — entries `{ id, ranAt, brief, fullOutput, source }`, `pendingRun` for Brewing UI, `lastScheduledDayKey`.

## Product rules

- Coffee / Jobs / Reminder notifies post with `parentEventId: null` (new top-level messages, never thread replies).
