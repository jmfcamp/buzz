# Bestie list protocol (`bestie-list`)

Bestie reminders and to-dos live in the Bestie DM RHS (localStorage, scoped by
relay / owner / agent). Mutations happen three ways:

1. **RHS UI** — category slide `+` (reminders include a due datetime picker and
   One-off / Daily repeat).
2. **Natural language** — user messages like `Remind me to … in 20 minutes` or
   `Add a todo: …` are applied client-side (and a short turn hint is appended so
   the agent can acknowledge with a fence).
3. **Agent fence** — Bestie agent replies may include:

```bestie-list
{"op":"add","items":[{"kind":"reminder","text":"Call mom","dueAt":1735689600}]}
```

`dueAt` is unix seconds (ISO-8601 strings also accepted). Optional
`repeat: {"kind":"daily"}` or `{"kind":"weekly","weekday":1}` (0=Sun). Ops:
`add`, `complete`, `remove`. Completing a recurring reminder advances `dueAt`
instead of marking done.

Due reminders are detected by the ~5 minute wake loop (plus a one-shot timer for
the next dueAt). A due nudge shows the footer `!` badge, auto-opens the Bestie
popover, and renders the amber Reminder banner (title **Reminder**, body = exact
reminder text). Banner actions: Dismiss, +15 min, +1 hour; square-arrow opens
the Reminders RHS/sheet.

Client dedupe: open items with the same kind and **core text** (time phrases
stripped) are not added twice when due times match within 120s, or when the
first item was created in the last 10 minutes; close dueAt + similar wording
also matches. Prefers keeping/upgrading the row that has `dueAt` (covers NL +
agent fence on one ask even when wording differs).
