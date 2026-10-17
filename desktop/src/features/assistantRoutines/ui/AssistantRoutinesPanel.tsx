// Routines view (web Assistant suite + desktop Assistant category sheet). Relay-only: nothing here needs Direct.
// Pickers are native <select>s, so no custom pop-ups stack over the keyboard on phones.
import { Loader2, Pencil, Play, Plus, Trash2 } from "lucide-react";
import * as React from "react";

import { useChannelsQuery } from "@/features/channels/hooks";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";

import {
  DEFAULT_WAKE_CHANNEL_NAME,
  defaultWakeChannel,
  deleteRoutine,
  type Routine,
  type RoutineAction,
  type RoutineActionType,
  routineSecretProblem,
  upsertRoutine,
} from "../routinesDoc";
import { runRoutine } from "../routinesRunner";
import { updateRoutines, useAssistantRoutines } from "../routinesSync";

const INPUT =
  "h-9 w-full min-w-0 rounded-md border border-border bg-background px-3 text-sm";
const ICON_BTN =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40";

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
function when(seconds: number) {
  const d = new Date(seconds * 1000);
  const t = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return new Date().toDateString() === d.toDateString()
    ? t
    : `${d.toLocaleDateString([], { month: "short", day: "numeric" })} ${t}`;
}

function useStreams() {
  const channels = useChannelsQuery().data ?? [];
  return React.useMemo(
    () =>
      channels
        .filter((c) => c.channelType !== "dm" && !c.archivedAt)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [channels],
  );
}

function summary(a: RoutineAction, channelName: (id: string | null) => string) {
  if (a.type === "post-to-channel")
    return `Post in #${channelName(a.channelId)}${a.mentionChannelBots ? " · @ all bots" : ""}`;
  return "Prompt the Assistant";
}

export function AssistantRoutinesPanel({
  me,
  adding,
  onAddDone,
}: {
  me: string | undefined;
  /** Controlled by a header + button (Assistant sheets): no inline "New routine" button then. */
  adding?: boolean;
  onAddDone?: () => void;
}) {
  const routines = useAssistantRoutines(me);
  const streams = useStreams();
  const fallback = defaultWakeChannel(streams);
  const channelName = (id: string | null) =>
    id
      ? (streams.find((c) => c.id === id)?.name ?? "unavailable channel")
      : (fallback?.name ?? `${DEFAULT_WAKE_CHANNEL_NAME} (not joined)`);
  const [editing, setEditing] = React.useState<Routine | "new" | null>(null);
  const [runningId, setRunningId] = React.useState<string | null>(null);
  const controlled = adding !== undefined;
  React.useEffect(() => {
    if (!controlled) return;
    setEditing((cur) => (adding ? (cur ?? "new") : cur === "new" ? null : cur));
  }, [adding, controlled]);
  const closeForm = () => {
    setEditing(null);
    onAddDone?.();
  };

  if (!routines)
    return <p className="text-xs text-muted-foreground">Loading routines…</p>;

  const play = async (r: Routine) => {
    setRunningId(r.id);
    try {
      await runRoutine(r, me);
    } finally {
      setRunningId(null);
    }
  };

  return (
    <div className="flex flex-col gap-2" data-testid="assistant-routines">
      <p className="px-0.5 text-xs text-muted-foreground">
        Press ▶ to run, or type a routine's name to the Assistant (e.g. “Wake
        the bots”). Messages are sent as you.
      </p>
      {editing ? (
        <RoutineForm
          initial={editing === "new" ? null : editing}
          onCancel={closeForm}
          onSave={(r) => {
            updateRoutines(me, (doc, now) => upsertRoutine(doc, r, now));
            closeForm();
          }}
          streams={streams}
        />
      ) : controlled ? null : (
        <Button
          className="h-8 self-start gap-1"
          data-testid="assistant-routine-add"
          onClick={() => setEditing("new")}
          size="sm"
          type="button"
          variant="outline"
        >
          <Plus className="size-4" /> New routine
        </Button>
      )}
      <div className="space-y-1.5">
        {routines.map((r) => (
          <div
            className="flex items-start gap-2 rounded-md border border-border/60 px-2 py-1.5 text-sm"
            data-testid={`assistant-routine-${r.id}`}
            key={r.id}
          >
            <button
              aria-label={`Run ${r.name}`}
              className={ICON_BTN}
              data-testid="assistant-routine-play"
              disabled={runningId !== null}
              onClick={() => void play(r)}
              title="Run"
              type="button"
            >
              {runningId === r.id ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Play className="size-4" />
              )}
            </button>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{r.name}</div>
              <div className="truncate text-xs text-muted-foreground">
                {summary(r.action, channelName)}
              </div>
              {r.lastRun ? (
                <div
                  className={cn(
                    "truncate text-xs",
                    r.lastRun.ok ? "text-muted-foreground" : "text-destructive",
                  )}
                  title={r.lastRun.detail}
                >
                  Last run {when(r.lastRun.at)} · {r.lastRun.ok ? "✓" : "✗"}{" "}
                  {r.lastRun.detail}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">Never run</div>
              )}
            </div>
            <button
              aria-label={`Edit ${r.name}`}
              className={ICON_BTN}
              onClick={() => setEditing(r)}
              title="Edit"
              type="button"
            >
              <Pencil className="size-4" />
            </button>
            <button
              aria-label={`Delete ${r.name}`}
              className={ICON_BTN}
              onClick={() => {
                if (window.confirm(`Delete the routine “${r.name}”?`))
                  updateRoutines(me, (doc, now) =>
                    deleteRoutine(doc, r.id, now),
                  );
              }}
              title="Delete"
              type="button"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function RoutineForm({
  initial,
  onCancel,
  onSave,
  streams,
}: {
  initial: Routine | null;
  onCancel: () => void;
  onSave: (r: Routine) => void;
  streams: { id: string; name: string }[];
}) {
  const [name, setName] = React.useState(initial?.name ?? "");
  const [type, setType] = React.useState<RoutineActionType>(
    initial?.action.type ?? "post-to-channel",
  );
  const post =
    initial?.action.type === "post-to-channel" ? initial.action : null;
  const [channelId, setChannelId] = React.useState<string>(
    post?.channelId ?? "",
  );
  const [text, setText] = React.useState(
    post?.text ??
      (initial?.action.type === "assistant-prompt"
        ? initial.action.prompt
        : ""),
  );
  const [mention, setMention] = React.useState(
    post?.mentionChannelBots ?? true,
  );
  const [err, setErr] = React.useState<string | null>(null);
  const fallback = defaultWakeChannel(streams);

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) return setErr("Give the routine a name.");
    if (!text.trim())
      return setErr(
        type === "assistant-prompt"
          ? "Write the prompt."
          : "Write the message.",
      );
    const action: RoutineAction =
      type === "post-to-channel"
        ? {
            type,
            channelId: channelId || null,
            text: text.trim(),
            mentionChannelBots: mention,
          }
        : { type, prompt: text.trim() };
    const routine: Routine = {
      ...(initial ?? {}),
      id: initial?.id ?? newId(),
      name: trimmed,
      action,
    };
    const problem = routineSecretProblem(routine);
    if (problem) return setErr(problem);
    onSave(routine);
  };

  return (
    <form
      className="flex flex-col gap-2 rounded-md border border-border/60 p-2"
      data-testid="assistant-routine-form"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <input
        aria-label="Routine name"
        className={INPUT}
        maxLength={120}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name (type this to the Assistant to run it)"
        value={name}
      />
      <select
        aria-label="Action"
        className={INPUT}
        onChange={(e) => setType(e.target.value as RoutineActionType)}
        value={type}
      >
        <option value="post-to-channel">Post a message to a channel</option>
        <option value="assistant-prompt">Send a prompt to the Assistant</option>
      </select>
      {type === "post-to-channel" ? (
        <>
          <select
            aria-label="Channel"
            className={INPUT}
            data-testid="assistant-routine-channel"
            onChange={(e) => setChannelId(e.target.value)}
            value={channelId}
          >
            <option value="">
              Default: #
              {fallback?.name ?? `${DEFAULT_WAKE_CHANNEL_NAME} (not joined)`}
            </option>
            {streams.map((c) => (
              <option key={c.id} value={c.id}>
                #{c.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-xs">
            <input
              checked={mention}
              onChange={(e) => setMention(e.target.checked)}
              type="checkbox"
            />
            @-mention every bot in the channel
          </label>
        </>
      ) : null}
      <textarea
        aria-label={type === "assistant-prompt" ? "Prompt" : "Message"}
        className="min-h-[72px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        maxLength={4000}
        onChange={(e) => setText(e.target.value)}
        placeholder={
          type === "assistant-prompt"
            ? "What should the Assistant do?"
            : "Message"
        }
        value={text}
      />
      <p className="text-2xs text-muted-foreground">
        Don't put passwords, keys or tokens in routines — they sync to your
        other devices.
      </p>
      {err ? <p className="text-xs text-destructive">{err}</p> : null}
      <div className="flex gap-2">
        <Button className="h-8" size="sm" type="submit">
          Save
        </Button>
        <Button
          className="h-8"
          onClick={onCancel}
          size="sm"
          type="button"
          variant="ghost"
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
