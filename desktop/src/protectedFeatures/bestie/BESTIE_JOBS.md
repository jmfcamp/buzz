# Bestie Jobs protocol (`bestie-job`)

Jobs are scheduled prompts. When due, desktop wakes Bestie and sends the prompt
as a user turn (not a nudge banner).

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
