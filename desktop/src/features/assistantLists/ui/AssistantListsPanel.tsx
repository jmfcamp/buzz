// Open web UI for the Assistant's to-dos and reminders (relay-synced doc, works with a NIP-46 signer only).
import {
  AlarmClock,
  Check,
  Clock,
  ListTodo,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import * as React from "react";

import { cn } from "@/shared/lib/cn";

import { type ListItem, type ListKind, liveItems } from "../listsDoc";
import { addItem, editItem, removeItem, setStatus, snooze } from "../listsOps";
import {
  updateAssistantLists,
  useAssistantListsDoc,
  useNowSeconds,
} from "../listsStore";

function toLocalInput(seconds: number) {
  const d = new Date(seconds * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fromLocalInput(v: string): number | null {
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? Math.floor(t / 1000) : null;
}
function whenLabel(dueAt: number, now: number) {
  const d = new Date(dueAt * 1000);
  const sameDay = new Date(now * 1000).toDateString() === d.toDateString();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return sameDay
    ? time
    : `${d.toLocaleDateString([], { month: "short", day: "numeric" })} ${time}`;
}
function tomorrowNine(now: number) {
  const d = new Date(now * 1000);
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

export function AssistantListsPanel({
  me,
  mode = "all",
  className,
  hideEmpty = false,
}: {
  me: string | undefined;
  mode?: "all" | "reminders" | "todos";
  className?: string;
  /** Skip the "No reminders." line (the Inbox Reminders tab has one empty state for both sections). */
  hideEmpty?: boolean;
}) {
  const doc = useAssistantListsDoc(me);
  const now = useNowSeconds(15_000);
  const [kind, setKind] = React.useState<ListKind>(
    mode === "reminders" ? "reminder" : "todo",
  );
  const [text, setText] = React.useState("");
  const [due, setDue] = React.useState(() =>
    toLocalInput(Math.floor(Date.now() / 1000) + 3600),
  );
  const [showDone, setShowDone] = React.useState(false);

  if (!doc) {
    return (
      <p
        className={cn("text-xs text-muted-foreground", className)}
        data-testid="assistant-lists-syncing"
      >
        Syncing your lists…
      </p>
    );
  }
  // mode=todos must show todos (was wrongly filtering to reminders only, so To-dos looked empty
  // aside from a stray Reminders section).
  const all = liveItems(doc).filter((i) => {
    if (mode === "reminders") return i.kind === "reminder";
    if (mode === "todos") return i.kind === "todo";
    return true;
  });
  const open = all.filter((i) => i.status === "open");
  const done = all.filter((i) => i.status === "done");
  const reminders = open
    .filter((i) => i.kind === "reminder")
    .sort((a, b) => (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity));
  const todos = open
    .filter((i) => i.kind === "todo")
    .sort(
      (a, b) =>
        Number(b.starred) - Number(a.starred) || a.sortOrder - b.sortOrder,
    );
  const edit = (fn: Parameters<typeof updateAssistantLists>[1]) =>
    updateAssistantLists(me, fn);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    const dueAt = kind === "reminder" ? fromLocalInput(due) : null;
    if (kind === "reminder" && dueAt == null) return;
    edit((d, n) => addItem(d, n, { kind, text: t, dueAt }));
    setText("");
  };

  return (
    <div
      className={cn("flex flex-col gap-2", className)}
      data-testid={`assistant-lists-${mode}`}
    >
      <form className="flex flex-col gap-2" onSubmit={submit}>
        <div className="flex items-center gap-2">
          {mode === "all" ? (
            <div className="flex shrink-0 rounded-md bg-muted/60 p-0.5">
              {(["todo", "reminder"] as const).map((k) => (
                <button
                  aria-label={k === "todo" ? "To-do" : "Reminder"}
                  aria-pressed={kind === k}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded text-muted-foreground",
                    kind === k && "bg-background text-foreground shadow-xs",
                  )}
                  key={k}
                  onClick={() => setKind(k)}
                  title={k === "todo" ? "To-do" : "Reminder"}
                  type="button"
                >
                  {k === "todo" ? (
                    <ListTodo className="h-4 w-4" />
                  ) : (
                    <AlarmClock className="h-4 w-4" />
                  )}
                </button>
              ))}
            </div>
          ) : null}
          <input
            aria-label={kind === "reminder" ? "New reminder" : "New to-do"}
            className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="assistant-lists-input"
            onChange={(e) => setText(e.target.value)}
            placeholder={kind === "reminder" ? "Remind me to…" : "Add a to-do…"}
            value={text}
          />
          <button
            aria-label="Add"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground disabled:opacity-50"
            data-testid="assistant-lists-add"
            disabled={!text.trim()}
            type="submit"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        {kind === "reminder" ? (
          <input
            aria-label="Remind at"
            className="h-9 rounded-md border border-border bg-background px-3 text-sm"
            onChange={(e) => setDue(e.target.value)}
            type="datetime-local"
            value={due}
          />
        ) : null}
      </form>

      {!hideEmpty && reminders.length + todos.length === 0 ? (
        <p className="py-2 text-center text-xs text-muted-foreground">
          {mode === "reminders"
            ? "No reminders."
            : mode === "todos"
              ? "No to-dos."
              : "Nothing on your lists."}
        </p>
      ) : null}
      {reminders.length > 0 ? <Section title="Reminders" /> : null}
      {reminders.map((i) => (
        <Row edit={edit} item={i} key={i.id} now={now} />
      ))}
      {todos.length > 0 ? <Section title="To-dos" /> : null}
      {todos.map((i) => (
        <Row edit={edit} item={i} key={i.id} now={now} />
      ))}
      {done.length > 0 ? (
        <button
          className="self-start text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setShowDone((v) => !v)}
          type="button"
        >
          {showDone ? "Hide" : "Show"} done ({done.length})
        </button>
      ) : null}
      {showDone
        ? done
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .slice(0, 50)
            .map((i) => <Row edit={edit} item={i} key={i.id} now={now} />)
        : null}
    </div>
  );
}

function Section({ title }: { title: string }) {
  return (
    <div className="pt-1 text-xs font-medium text-muted-foreground">
      {title}
    </div>
  );
}

function Row({
  item,
  now,
  edit,
}: {
  item: ListItem;
  now: number;
  edit: (fn: Parameters<typeof updateAssistantLists>[1]) => boolean;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(item.text);
  const [draftDue, setDraftDue] = React.useState(
    item.dueAt ? toLocalInput(item.dueAt) : "",
  );
  const [snoozing, setSnoozing] = React.useState(false);
  const isDone = item.status === "done";
  const isDue =
    item.kind === "reminder" &&
    !isDone &&
    item.dueAt != null &&
    item.dueAt <= now;
  const iconBtn =
    "flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground";

  if (editing) {
    return (
      <form
        className="flex flex-col gap-2 rounded-md border border-border/60 p-2"
        onSubmit={(e) => {
          e.preventDefault();
          edit((d, n) =>
            editItem(
              d,
              item.id,
              {
                text: draft,
                ...(item.kind === "reminder"
                  ? { dueAt: fromLocalInput(draftDue) }
                  : {}),
              },
              n,
            ),
          );
          setEditing(false);
        }}
      >
        <input
          aria-label="Edit text"
          className="h-9 rounded-md border border-border bg-background px-3 text-sm"
          onChange={(e) => setDraft(e.target.value)}
          value={draft}
        />
        {item.kind === "reminder" ? (
          <input
            aria-label="Remind at"
            className="h-9 rounded-md border border-border bg-background px-3 text-sm"
            onChange={(e) => setDraftDue(e.target.value)}
            type="datetime-local"
            value={draftDue}
          />
        ) : null}
        <div className="flex justify-end gap-2">
          <button
            className="h-8 rounded-md px-3 text-xs text-muted-foreground hover:bg-accent"
            onClick={() => setEditing(false)}
            type="button"
          >
            Cancel
          </button>
          <button
            className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground"
            type="submit"
          >
            Save
          </button>
        </div>
      </form>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-md border border-border/60 py-1 pl-1 pr-1 text-sm",
        isDue && "border-primary/50 bg-primary/5",
      )}
      data-testid="assistant-lists-row"
    >
      <button
        aria-label={isDone ? "Mark not done" : "Mark done"}
        aria-pressed={isDone}
        className={iconBtn}
        onClick={() => edit((d, n) => setStatus(d, item.id, !isDone, n))}
        type="button"
      >
        <span
          className={cn(
            "flex h-4 w-4 items-center justify-center rounded border border-muted-foreground/60",
            isDone && "border-primary bg-primary text-primary-foreground",
          )}
        >
          {isDone ? <Check className="h-3 w-3" /> : null}
        </span>
      </button>
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "truncate",
            isDone && "text-muted-foreground line-through",
          )}
        >
          {item.text}
        </div>
        {item.kind === "reminder" && item.dueAt ? (
          <div
            className={cn(
              "text-xs text-muted-foreground",
              isDue && "text-primary",
            )}
          >
            {isDue ? "Due · " : ""}
            {whenLabel(item.dueAt, now)}
            {item.repeat
              ? item.repeat.kind === "daily"
                ? " · daily"
                : " · weekly"
              : ""}
          </div>
        ) : null}
      </div>
      {snoozing ? (
        <>
          {[
            ["1h", now + 3600],
            ["Tomorrow", tomorrowNine(now)],
          ].map(([label, at]) => (
            <button
              className="h-8 rounded-md px-2 text-xs hover:bg-accent"
              key={String(label)}
              onClick={() => {
                edit((d, n) => snooze(d, item.id, Number(at) - n, n));
                setSnoozing(false);
              }}
              type="button"
            >
              {label}
            </button>
          ))}
          <button
            aria-label="Cancel snooze"
            className={iconBtn}
            onClick={() => setSnoozing(false)}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </>
      ) : (
        <>
          {item.kind === "reminder" && !isDone ? (
            <button
              aria-label="Snooze"
              className={iconBtn}
              onClick={() => setSnoozing(true)}
              title="Snooze"
              type="button"
            >
              <Clock className="h-4 w-4" />
            </button>
          ) : null}
          <button
            aria-label="Edit"
            className={iconBtn}
            onClick={() => setEditing(true)}
            title="Edit"
            type="button"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            aria-label="Delete"
            className={cn(iconBtn, "hover:text-destructive")}
            onClick={() => edit((d, n) => removeItem(d, item.id, n))}
            title="Delete"
            type="button"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </>
      )}
    </div>
  );
}
