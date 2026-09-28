# Bestie Jobs protocol (`bestie-job`)

Jobs are scheduled prompts. When due, desktop wakes the Assistant agent and
sends the prompt as a **top-level Assistant DM user turn** (not a nudge banner,
not a second channel).

## Busy policy (Queue)

Job fires and due-reminder notifies share the Assistant DM session with
interactive chat. Managed agents set `BUZZ_ACP_MULTIPLE_EVENT_HANDLING=queue`
and `BUZZ_ACP_DEDUP=queue`, so when the agent is mid-turn (thinking) a due
notify **queues** and runs as its own top-level turn after the current turn
finishes — it must not Drop or Steer/interrupt the in-flight turn.

Do **not** create a parallel `#bestie-jobs` (or any second) channel for this.

Coffee + thread-summarize also stay on the Assistant DM as top-level turns.

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
