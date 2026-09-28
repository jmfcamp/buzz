# Bestie Jobs protocol (`bestie-job`)

Jobs are scheduled prompts. When due, desktop wakes Bestie and sends the prompt
as a user turn (not a nudge banner).

## Parallel session (not the Bestie DM)

Job fires and due-reminder agent notifies post to a dedicated private stream
`#bestie-jobs` (lazy-created, Bestie agent as bot member), **not** the Bestie DM.

Buzz ACP keys provider sessions per channel; DMs are one Conversation scope with
a single in-flight turn. Sharing the Bestie DM queue means a job mid-chat is
dropped (Drop dedup) or steers/interrupts the chat turn (Queue/Steer). A second
channel gives the same agent a second SessionScope so jobs run in parallel with
interactive Bestie DM/popover chat — no second OS process, no Kiingo sidecar.

Mention `p`-tags include the Bestie agent so Mentions-mode harnesses wake.
Coffee + thread-summarize stay on the Bestie DM (user-facing chat).

## Schedule kinds

- `once` — `{ "kind": "once", "dueAt": <unix seconds> }`
- `interval` — `{ "kind": "interval", "everySeconds": 3600 }`
- `daily` — `{ "kind": "daily", "hour": 9, "minute": 0 }`
- `weekly` — `{ "kind": "weekly", "weekday": 1, "hour": 9, "minute": 0 }` (0=Sun)

## Agent fence

```bestie-job
{"op":"add","job":{"title":"Morning brief","prompt":"Summarize calendar","schedule":{"kind":"daily","hour":9,"minute":0}}}
```

Ops: `add`, `update`, `remove`.

## Client NL examples

- `Schedule a job in 5 minutes to summarize my inbox`
- `Every 30 minutes run a job to check the build`
- `Cancel job "Inbox"`

## Deduping

Same title+prompt within 10 minutes is not added twice (NL + fence).
Each due slot (`jobId@dueAt`) fires once; recurring jobs reschedule `nextDueAt`.
