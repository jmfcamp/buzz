// Web Assistant suite: the same categories as the desktop Assistant (Reminders, To-dos, Jobs, Coffee, Threads,
// Scratch). Reminders and to-dos are relay-synced (signer-only). Jobs, coffee, threads and scratch keep running on
// the desktop and are read/operated over Direct; without Direct those sections are shown disabled ("Needs Direct").
import {
  AlarmClock,
  ArrowLeft,
  Briefcase,
  ChevronDown,
  ChevronRight,
  Coffee,
  ExternalLink,
  ListTodo,
  Loader2,
  MessagesSquare,
  Pause,
  Pencil,
  Play,
  Plus,
  StickyNote,
  Trash2,
} from "lucide-react";
import * as React from "react";

import { useAppNavigation } from "@/app/navigation/useAppNavigation";
import {
  dueReminderItems,
  liveItems,
} from "@/features/assistantLists/listsDoc";
import {
  useAssistantListsDoc,
  useNowSeconds,
} from "@/features/assistantLists/listsStore";
import { AssistantListsPanel } from "@/features/assistantLists/ui/AssistantListsPanel";
import { cn } from "@/shared/lib/cn";

import { computeBestieJobNextDueAt } from "../core/bestieJobSchedule";
import type {
  BestieCoffeeEntry,
  BestieCoffeePrefs,
} from "../core/bestieCoffeeTypes";
import type { BestieJob, BestieJobSchedule } from "../core/bestieJobTypes";
import type { BestieScratchNote } from "../core/bestieScratchTypes";
import type { BestieTrackedThread } from "../core/bestieThreadTypes";
import { useAssistantData } from "../dataStore";

export type SuiteCategory =
  | "reminder"
  | "todo"
  | "job"
  | "coffee"
  | "thread"
  | "scratch";

type JobsState = {
  jobs: BestieJob[];
  firedSlotIds: string[];
  processedMessageIds: string[];
};
type CoffeeState = {
  entries: BestieCoffeeEntry[];
  forgottenTriggerIds: string[];
  pendingRun?: { startedAt: number } | null;
  prefs?: BestieCoffeePrefs;
  brewRequest?: unknown;
  brewHandled?: unknown;
};
type ScratchState = {
  notes: BestieScratchNote[];
  processedMessageIds: string[];
};
type ThreadsState = {
  threads: BestieTrackedThread[];
  pendingSummarize?: { threadId: string } | null;
  summarizeRequest?: unknown;
  summarizeHandled?: unknown;
};

const ROW =
  "flex items-center gap-2 rounded-md border border-border/60 px-2 py-1.5 text-sm";
const ICON_BTN =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40";
const INPUT =
  "h-9 min-w-0 rounded-md border border-border bg-background px-3 text-sm";
const nowS = () => Math.floor(Date.now() / 1000);
const pad = (n: number) => String(n).padStart(2, "0");
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
function when(seconds: number) {
  const d = new Date(seconds * 1000);
  const today = new Date().toDateString() === d.toDateString();
  const t = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return today
    ? t
    : `${d.toLocaleDateString([], { month: "short", day: "numeric" })} ${t}`;
}

/** Counts + live states for the category nav (same as the desktop's). */
export function useSuiteSummary(me: string | undefined) {
  const lists = useAssistantListsDoc(me);
  const jobs = useAssistantData<JobsState>("jobs").data;
  const coffee = useAssistantData<CoffeeState>("coffee").data;
  const scratch = useAssistantData<ScratchState>("scratch").data;
  const threads = useAssistantData<ThreadsState>("threads").data;
  const now = useNowSeconds();
  const items = lists ? liveItems(lists) : [];
  return {
    reminder: items.filter((i) => i.kind === "reminder" && i.status === "open")
      .length,
    dueReminders: lists ? dueReminderItems(lists, now).length : 0,
    todo: items.filter((i) => i.kind === "todo" && i.status === "open").length,
    job: (jobs?.jobs ?? []).filter((j) => j.enabled).length,
    coffee: (coffee?.entries ?? []).length,
    coffeeLive: Boolean(coffee?.pendingRun),
    thread: (threads?.threads ?? []).length,
    threadLive: Boolean(threads?.pendingSummarize),
    scratch: (scratch?.notes ?? []).length,
    directLive:
      jobs !== null || coffee !== null || scratch !== null || threads !== null,
  };
}

const DIRECT_CATS = new Set<SuiteCategory>([
  "job",
  "coffee",
  "thread",
  "scratch",
]);

const CATS: {
  key: SuiteCategory;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { key: "reminder", label: "Reminders", icon: AlarmClock },
  { key: "todo", label: "To-dos", icon: ListTodo },
  { key: "job", label: "Jobs", icon: Briefcase },
  { key: "coffee", label: "Coffee", icon: Coffee },
  { key: "thread", label: "Threads", icon: MessagesSquare },
  { key: "scratch", label: "Scratch", icon: StickyNote },
];

export function SuiteCategoryNav({
  me,
  onOpen,
}: {
  me: string | undefined;
  onOpen: (c: SuiteCategory) => void;
}) {
  const s = useSuiteSummary(me);
  return (
    <div className="grid grid-cols-3 gap-1.5" data-testid="assistant-suite-nav">
      {CATS.map(({ key, label, icon: Icon }) => {
        const live =
          (key === "coffee" && s.coffeeLive) ||
          (key === "thread" && s.threadLive);
        const count = s[key];
        const due = key === "reminder" && s.dueReminders > 0;
        const needsDirect = DIRECT_CATS.has(key) && !s.directLive;
        return (
          <button
            title={
              needsDirect ? "Needs Direct (your desktop connected)" : undefined
            }
            className={cn(
              needsDirect && "opacity-50",
              "flex h-10 min-w-0 items-center gap-1.5 rounded-md border border-border/60 bg-card px-2 text-left text-xs font-medium transition-colors hover:bg-accent",
            )}
            data-testid={`assistant-suite-${key}`}
            key={key}
            onClick={() => onOpen(key)}
            type="button"
          >
            <Icon className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {live ? (
              <Loader2
                aria-label="Running"
                className="size-3.5 shrink-0 animate-spin text-primary"
              />
            ) : count > 0 ? (
              <span
                className={cn(
                  "shrink-0 rounded-full px-1.5 text-[10px] leading-4 tabular-nums",
                  due
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function SuiteSection({
  category,
  hideHeader = false,
  me,
  onBack,
  onNavigate,
}: {
  category: SuiteCategory;
  hideHeader?: boolean;
  me: string | undefined;
  onBack: () => void;
  onNavigate?: () => void;
}) {
  const cat = CATS.find((c) => c.key === category);
  return (
    <div
      className="flex flex-col gap-2"
      data-testid={`assistant-suite-section-${category}`}
    >
      <div className={cn("flex items-center gap-1", hideHeader && "hidden")}>
        <button
          aria-label="Back"
          className={ICON_BTN}
          onClick={onBack}
          type="button"
        >
          <ArrowLeft className="size-4" />
        </button>
        <span className="text-sm font-semibold">{cat?.label}</span>
      </div>
      {category === "reminder" ? (
        <AssistantListsPanel me={me} mode="reminders" />
      ) : null}
      {category === "todo" ? (
        <AssistantListsPanel me={me} mode="todos" />
      ) : null}
      {category === "job" ? <JobsSection me={me} /> : null}
      {category === "coffee" ? <CoffeeSection me={me} /> : null}
      {category === "thread" ? (
        <ThreadsSection me={me} onNavigate={onNavigate} />
      ) : null}
      {category === "scratch" ? <ScratchSection me={me} /> : null}
    </div>
  );
}

function Syncing() {
  return (
    <p className="text-xs text-muted-foreground">Loading from your desktop…</p>
  );
}

/** Shown instead of a desktop-run section when Direct is down. */
function NeedsDirect({ what }: { what: string }) {
  return (
    <div
      className="rounded-md border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground opacity-70"
      data-testid="assistant-needs-direct"
    >
      <div className="font-medium">Needs Direct</div>
      <div className="text-xs">
        {what} run on your desktop app. Connect it with Direct to see and manage
        them here.
      </div>
    </div>
  );
}

function useAct(
  act: (a: string, p?: Record<string, unknown>) => Promise<void>,
) {
  const [err, setErr] = React.useState<string | null>(null);
  const run = React.useCallback(
    (a: string, p?: Record<string, unknown>) => {
      setErr(null);
      act(a, p).catch((e) =>
        setErr(e instanceof Error ? e.message : "Couldn't reach your desktop."),
      );
    },
    [act],
  );
  return { run, err };
}

function ErrLine({ err }: { err: string | null }) {
  return err ? (
    <p className="text-xs text-destructive" role="alert">
      {err}
    </p>
  ) : null;
}
function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}

// ---- Jobs -----------------------------------------------------------------------------------------------------

function scheduleLabel(s: BestieJobSchedule) {
  if (s.kind === "once") return `Once · ${when(s.dueAt)}`;
  if (s.kind === "interval") {
    const m = Math.round(s.everySeconds / 60);
    return m % 60 === 0 ? `Every ${m / 60}h` : `Every ${m}m`;
  }
  const t = new Date(2000, 0, 1, s.hour, s.minute).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  return s.kind === "daily"
    ? `Daily · ${t}`
    : `${WEEKDAYS[s.weekday] ?? "Weekly"} · ${t}`;
}

function JobsSection(_: { me: string | undefined }) {
  const { data: state, live, error, act } = useAssistantData<JobsState>("jobs");
  const { run, err } = useAct(act);
  const [adding, setAdding] = React.useState(false);
  if (!live) return <NeedsDirect what="Jobs" />;
  if (!state) return error ? <ErrLine err={error} /> : <Syncing />;
  const jobs = [...state.jobs].sort(
    (a, b) => (a.nextDueAt ?? Infinity) - (b.nextDueAt ?? Infinity),
  );
  return (
    <>
      {adding ? (
        <JobForm
          onCancel={() => setAdding(false)}
          onSave={(job) => {
            run("add", {
              title: job.title,
              prompt: job.prompt,
              schedule: job.schedule,
              enabled: true,
            });
            setAdding(false);
          }}
        />
      ) : (
        <button
          className={cn(
            ROW,
            "justify-center text-muted-foreground hover:bg-accent",
          )}
          data-testid="assistant-job-add"
          onClick={() => setAdding(true)}
          type="button"
        >
          <Plus className="size-4" /> New job
        </button>
      )}
      {jobs.length === 0 ? (
        <Hint>
          No jobs yet. Jobs are prompts your Assistant runs on a schedule.
        </Hint>
      ) : null}
      {jobs.map((job) => (
        <JobRow
          job={job}
          key={job.id}
          onChange={(next) =>
            run("update", {
              id: job.id,
              title: next.title,
              prompt: next.prompt,
              schedule: next.schedule,
              enabled: next.enabled,
            })
          }
          onRemove={() => run("remove", { id: job.id })}
        />
      ))}
      <ErrLine err={err} />
      <Hint>
        Jobs run on your desktop app; changes here go straight to it over
        Direct.
      </Hint>
    </>
  );
}

function JobRow({
  job,
  onChange,
  onRemove,
}: {
  job: BestieJob;
  onChange: (j: BestieJob) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  if (editing) {
    return (
      <JobForm
        initial={job}
        onCancel={() => setEditing(false)}
        onSave={(j) => {
          onChange(j);
          setEditing(false);
        }}
      />
    );
  }
  const toggle = () => {
    const now = nowS();
    const enabled = !job.enabled;
    onChange({
      ...job,
      enabled,
      nextDueAt: enabled ? computeBestieJobNextDueAt(job.schedule, now) : null,
      updatedAt: now,
    });
  };
  return (
    <div
      className="rounded-md border border-border/60"
      data-testid="assistant-job-row"
    >
      <div className="flex items-center gap-1 px-1 py-1">
        <button
          aria-label={open ? "Collapse" : "Expand"}
          className={ICON_BTN}
          onClick={() => setOpen((v) => !v)}
          type="button"
        >
          {open ? (
            <ChevronDown className="size-4" />
          ) : (
            <ChevronRight className="size-4" />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              "truncate text-sm",
              !job.enabled && "text-muted-foreground",
            )}
          >
            {job.title}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {scheduleLabel(job.schedule)}
            {job.enabled && job.nextDueAt
              ? ` · next ${when(job.nextDueAt)}`
              : job.enabled
                ? ""
                : " · paused"}
          </div>
        </div>
        <button
          aria-label={job.enabled ? "Pause" : "Resume"}
          className={ICON_BTN}
          onClick={toggle}
          title={job.enabled ? "Pause" : "Resume"}
          type="button"
        >
          {job.enabled ? (
            <Pause className="size-4" />
          ) : (
            <Play className="size-4" />
          )}
        </button>
        <button
          aria-label="Edit"
          className={ICON_BTN}
          onClick={() => setEditing(true)}
          title="Edit"
          type="button"
        >
          <Pencil className="size-4" />
        </button>
        <button
          aria-label="Delete"
          className={cn(ICON_BTN, "hover:text-destructive")}
          onClick={onRemove}
          title="Delete"
          type="button"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
      {open ? (
        <div className="border-t border-border/60 px-3 py-2 text-xs whitespace-pre-wrap text-muted-foreground">
          {job.prompt}
          {job.lastRunAt ? (
            <div className="pt-1">Last run {when(job.lastRunAt)}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function JobForm({
  initial,
  onCancel,
  onSave,
}: {
  initial?: BestieJob;
  onCancel: () => void;
  onSave: (j: BestieJob) => void;
}) {
  const s0 = initial?.schedule;
  const [title, setTitle] = React.useState(initial?.title ?? "");
  const [prompt, setPrompt] = React.useState(initial?.prompt ?? "");
  const [kind, setKind] = React.useState<BestieJobSchedule["kind"]>(
    s0?.kind ?? "daily",
  );
  const [time, setTime] = React.useState(
    s0 && "hour" in s0 ? `${pad(s0.hour)}:${pad(s0.minute)}` : "09:00",
  );
  const [weekday, setWeekday] = React.useState(
    s0?.kind === "weekly" ? s0.weekday : 1,
  );
  const [everyMin, setEveryMin] = React.useState(
    s0?.kind === "interval" ? Math.round(s0.everySeconds / 60) : 60,
  );
  const [onceAt, setOnceAt] = React.useState(() => {
    const d = new Date(
      ((s0?.kind === "once" ? s0.dueAt : nowS() + 3600) as number) * 1000,
    );
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const build = (): BestieJobSchedule | null => {
    const [h, m] = time.split(":").map(Number);
    if (kind === "daily") return { kind, hour: h ?? 9, minute: m ?? 0 };
    if (kind === "weekly")
      return { kind, hour: h ?? 9, minute: m ?? 0, weekday };
    if (kind === "interval")
      return { kind, everySeconds: Math.max(1, everyMin) * 60 };
    const t = new Date(onceAt).getTime();
    return Number.isFinite(t) ? { kind, dueAt: Math.floor(t / 1000) } : null;
  };
  return (
    <form
      className="flex flex-col gap-2 rounded-md border border-border/60 p-2"
      data-testid="assistant-job-form"
      onSubmit={(e) => {
        e.preventDefault();
        const schedule = build();
        if (!schedule || !title.trim() || !prompt.trim()) return;
        const now = nowS();
        onSave({
          createdAt: initial?.createdAt ?? now,
          enabled: initial?.enabled ?? true,
          id: initial?.id ?? newId(),
          lastRunAt: initial?.lastRunAt ?? null,
          nextDueAt:
            initial && !initial.enabled
              ? null
              : computeBestieJobNextDueAt(schedule, now),
          prompt: prompt.trim(),
          schedule,
          sourceMessageId: initial?.sourceMessageId ?? null,
          title: title.trim(),
          updatedAt: now,
        });
      }}
    >
      <input
        aria-label="Job title"
        className={INPUT}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        value={title}
      />
      <textarea
        aria-label="What should the Assistant do?"
        className="min-h-[64px] rounded-md border border-border bg-background px-3 py-2 text-sm"
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="What should your Assistant do?"
        value={prompt}
      />
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Schedule"
          className={INPUT}
          onChange={(e) => setKind(e.target.value as BestieJobSchedule["kind"])}
          value={kind}
        >
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="interval">Every…</option>
          <option value="once">Once</option>
        </select>
        {kind === "weekly" ? (
          <select
            aria-label="Weekday"
            className={INPUT}
            onChange={(e) => setWeekday(Number(e.target.value))}
            value={weekday}
          >
            {WEEKDAYS.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
        ) : null}
        {kind === "daily" || kind === "weekly" ? (
          <input
            aria-label="Time"
            className={INPUT}
            onChange={(e) => setTime(e.target.value)}
            type="time"
            value={time}
          />
        ) : null}
        {kind === "interval" ? (
          <label className="flex items-center gap-1 text-xs">
            <input
              aria-label="Minutes"
              className={cn(INPUT, "w-20")}
              min={1}
              onChange={(e) => setEveryMin(Number(e.target.value))}
              type="number"
              value={everyMin}
            />
            min
          </label>
        ) : null}
        {kind === "once" ? (
          <input
            aria-label="When"
            className={INPUT}
            onChange={(e) => setOnceAt(e.target.value)}
            type="datetime-local"
            value={onceAt}
          />
        ) : null}
      </div>
      <div className="flex justify-end gap-2">
        <button
          className="h-8 rounded-md px-3 text-xs text-muted-foreground hover:bg-accent"
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
        <button
          className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-50"
          disabled={!title.trim() || !prompt.trim()}
          type="submit"
        >
          Save
        </button>
      </div>
    </form>
  );
}

// ---- Coffee ---------------------------------------------------------------------------------------------------

function CoffeeSection(_: { me: string | undefined }) {
  const {
    data: state,
    live: direct,
    error,
    act,
  } = useAssistantData<CoffeeState>("coffee");
  const { run, err } = useAct(act);
  const [openId, setOpenId] = React.useState<string | null>(null);
  if (!direct) return <NeedsDirect what="Coffee chats" />;
  if (!state) return error ? <ErrLine err={error} /> : <Syncing />;
  const prefs = state.prefs ?? { hour: 8, minute: 0 };
  const live = Boolean(state.pendingRun);
  return (
    <>
      <div className="flex items-center gap-2">
        <button
          className="flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
          data-testid="assistant-coffee-brew"
          disabled={live}
          onClick={() => run("brew")}
          type="button"
        >
          {live ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Coffee className="size-4" />
          )}
          {live ? "Brewing…" : "Brew now"}
        </button>
        <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          Morning coffee at
          <input
            aria-label="Morning coffee time"
            className={cn(INPUT, "h-8")}
            onChange={(e) => {
              const [h, m] = e.target.value.split(":").map(Number);
              if (Number.isFinite(h) && Number.isFinite(m))
                run("prefs", { hour: h, minute: m });
            }}
            type="time"
            value={`${pad(prefs.hour)}:${pad(prefs.minute)}`}
          />
        </label>
      </div>
      {state.entries.length === 0 ? <Hint>No coffee chats yet.</Hint> : null}
      {state.entries.map((e) => (
        <div
          className="rounded-md border border-border/60"
          data-testid="assistant-coffee-entry"
          key={e.id}
        >
          <div className="flex items-center gap-1 px-1 py-1">
            <button
              aria-label="Expand"
              className={ICON_BTN}
              onClick={() => setOpenId(openId === e.id ? null : e.id)}
              type="button"
            >
              {openId === e.id ? (
                <ChevronDown className="size-4" />
              ) : (
                <ChevronRight className="size-4" />
              )}
            </button>
            <div className="min-w-0 flex-1">
              <div className="line-clamp-2 text-sm">
                {e.brief || "Coffee chat"}
              </div>
              <div className="text-xs text-muted-foreground">
                {when(e.ranAt)} · {e.source === "brew" ? "Brewed" : "Morning"}
              </div>
            </div>
            <button
              aria-label="Delete"
              className={cn(ICON_BTN, "hover:text-destructive")}
              onClick={() => run("remove", { id: e.id })}
              type="button"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
          {openId === e.id ? (
            <div className="max-h-72 overflow-y-auto border-t border-border/60 px-3 py-2 text-xs whitespace-pre-wrap">
              {e.fullOutput || e.brief}
            </div>
          ) : null}
        </div>
      ))}
      <ErrLine err={err} />
      <Hint>
        Coffee runs on your desktop app (it must be open); “Brew now” asks it to
        start.
      </Hint>
    </>
  );
}

// ---- Threads --------------------------------------------------------------------------------------------------

function ThreadsSection({
  onNavigate,
}: {
  me: string | undefined;
  onNavigate?: () => void;
}) {
  const {
    data: state,
    live,
    error,
    act,
  } = useAssistantData<ThreadsState>("threads");
  const { run, err } = useAct(act);
  const { goChannel } = useAppNavigation();
  const [openId, setOpenId] = React.useState<string | null>(null);
  if (!live) return <NeedsDirect what="Tracked threads" />;
  if (!state) return error ? <ErrLine err={error} /> : <Syncing />;
  const busyId = state.pendingSummarize?.threadId ?? null;
  return (
    <>
      {state.threads.length === 0 ? (
        <Hint>
          No threads yet. Ask your Assistant about a thread to track it.
        </Hint>
      ) : null}
      {state.threads.map((t) => (
        <div
          className="rounded-md border border-border/60"
          data-testid="assistant-thread-row"
          key={t.id}
        >
          <div className="flex items-center gap-1 px-1 py-1">
            <button
              aria-label="Expand"
              className={ICON_BTN}
              onClick={() => setOpenId(openId === t.id ? null : t.id)}
              type="button"
            >
              {openId === t.id ? (
                <ChevronDown className="size-4" />
              ) : (
                <ChevronRight className="size-4" />
              )}
            </button>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm">{t.preview || "Thread"}</div>
              <div className="truncate text-xs text-muted-foreground">
                {t.channelName ? `#${t.channelName}` : "Thread"}
                {t.authorName ? ` · ${t.authorName}` : ""} ·{" "}
                {when(t.lastActiveAt)}
              </div>
            </div>
            <button
              aria-label="Summarize"
              className={ICON_BTN}
              disabled={Boolean(busyId)}
              onClick={() => run("summarize", { id: t.id })}
              title="Summarize (runs on your desktop)"
              type="button"
            >
              {busyId === t.id ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <MessagesSquare className="size-4" />
              )}
            </button>
            <button
              aria-label="Open thread"
              className={ICON_BTN}
              onClick={() => {
                onNavigate?.();
                void goChannel(t.channelId, { threadRootId: t.rootEventId });
              }}
              title="Open thread"
              type="button"
            >
              <ExternalLink className="size-4" />
            </button>
            <button
              aria-label="Stop tracking"
              className={cn(ICON_BTN, "hover:text-destructive")}
              onClick={() => run("remove", { id: t.id })}
              title="Stop tracking"
              type="button"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
          {openId === t.id ? (
            <div className="border-t border-border/60 px-3 py-2 text-xs whitespace-pre-wrap">
              {t.lastSummary ? (
                <>
                  {t.lastSummary}
                  {t.lastSummaryAt ? (
                    <div className="pt-1 text-muted-foreground">
                      Summarized {when(t.lastSummaryAt)}
                    </div>
                  ) : null}
                </>
              ) : (
                <span className="text-muted-foreground">No summary yet.</span>
              )}
            </div>
          ) : null}
        </div>
      ))}
      <ErrLine err={err} />
    </>
  );
}

function ScratchSection(_: { me: string | undefined }) {
  const {
    data: state,
    live,
    error,
    act,
  } = useAssistantData<ScratchState>("scratch");
  const { run, err } = useAct(act);
  const [editing, setEditing] = React.useState<
    BestieScratchNote | "new" | null
  >(null);
  if (!live) return <NeedsDirect what="Scratch notes" />;
  if (!state) return error ? <ErrLine err={error} /> : <Syncing />;
  const save = (note: BestieScratchNote) => {
    if (state.notes.some((n) => n.id === note.id))
      run("update", {
        id: note.id,
        title: note.title,
        body: note.body,
        draft: note.draft,
      });
    else run("add", { title: note.title, body: note.body, draft: note.draft });
  };
  if (editing) {
    const base: BestieScratchNote =
      editing === "new"
        ? {
            body: "",
            createdAt: nowS(),
            draft: false,
            id: newId(),
            sourceMessageId: null,
            title: "",
            updatedAt: nowS(),
          }
        : editing;
    return (
      <ScratchEditor
        initial={base}
        onClose={() => setEditing(null)}
        onSave={save}
      />
    );
  }
  return (
    <>
      <button
        className={cn(
          ROW,
          "justify-center text-muted-foreground hover:bg-accent",
        )}
        data-testid="assistant-scratch-new"
        onClick={() => setEditing("new")}
        type="button"
      >
        <Plus className="size-4" /> New note
      </button>
      <ErrLine err={err} />
      {state.notes.length === 0 ? <Hint>No notes yet.</Hint> : null}
      {state.notes.map((n) => (
        <div className={ROW} data-testid="assistant-scratch-row" key={n.id}>
          <button
            className="min-w-0 flex-1 text-left"
            onClick={() => setEditing(n)}
            type="button"
          >
            <div className="truncate">
              {n.title || "Untitled"}
              {n.draft ? (
                <span className="ml-1 text-xs text-muted-foreground">
                  (draft)
                </span>
              ) : null}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {n.body.split("\n")[0] || " "}
            </div>
          </button>
          <button
            aria-label="Delete"
            className={cn(ICON_BTN, "hover:text-destructive")}
            onClick={() => run("remove", { id: n.id })}
            type="button"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      ))}
    </>
  );
}

function ScratchEditor({
  initial,
  onClose,
  onSave,
}: {
  initial: BestieScratchNote;
  onClose: () => void;
  onSave: (n: BestieScratchNote) => void;
}) {
  const [title, setTitle] = React.useState(initial.title);
  const [body, setBody] = React.useState(initial.body);
  const dirty = title !== initial.title || body !== initial.body;
  // Closing with unsaved text keeps it as a draft (same as the desktop scratchpad).
  const close = () => {
    if (dirty && (title.trim() || body.trim()))
      onSave({ ...initial, title, body, draft: true, updatedAt: nowS() });
    onClose();
  };
  return (
    <div className="flex flex-col gap-2" data-testid="assistant-scratch-editor">
      <input
        aria-label="Title"
        className={INPUT}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        value={title}
      />
      <textarea
        aria-label="Note"
        className="min-h-[200px] rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
        onChange={(e) => setBody(e.target.value)}
        value={body}
      />
      <div className="flex justify-end gap-2">
        <button
          className="h-8 rounded-md px-3 text-xs text-muted-foreground hover:bg-accent"
          onClick={close}
          type="button"
        >
          Close
        </button>
        <button
          className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground"
          onClick={() => {
            onSave({
              ...initial,
              title: title.trim() || "Untitled",
              body,
              draft: false,
              updatedAt: nowS(),
            });
            onClose();
          }}
          type="button"
        >
          Save
        </button>
      </div>
    </div>
  );
}

// ---- Lists expansion card (same markup/classes as the desktop popover's Lists section) ------------------------

const RHS_ROW_CLASS =
  "h-8 w-full justify-start gap-2 rounded-md px-2 py-1.5 text-left text-sm font-normal text-sidebar-foreground/80 transition-[background-color,color] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50";
const PILL =
  "h-7 gap-1 rounded-full border border-border/50 bg-muted/45 px-2.5 text-xs font-medium text-foreground shadow-none hover:bg-muted/70";
const COLLAPSED_KEY = "buzz-assistant-popover-lists-collapsed.v1";

function readCollapsed() {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function AssistantListsCard({
  me,
  onNavigate,
  tabbed = false,
}: {
  me: string | undefined;
  onNavigate?: () => void;
  /** Touch/tablet Lists tab: always expanded, fills the popup, no toggle row. */
  tabbed?: boolean;
}) {
  const s = useSuiteSummary(me);
  const [collapsedPref, setCollapsedState] = React.useState(readCollapsed);
  const collapsed = tabbed ? false : collapsedPref;
  const [active, setActive] = React.useState<SuiteCategory | null>(null);
  const setCollapsed = (v: boolean) => {
    setCollapsedState(v);
    try {
      window.localStorage.setItem(COLLAPSED_KEY, v ? "1" : "0");
    } catch {
      /* UI preference only */
    }
  };
  return (
    <div
      className={cn(
        tabbed
          ? "flex min-h-0 flex-1 flex-col overflow-y-auto"
          : "min-h-0 shrink-0 border-t border-border/60 pt-2",
      )}
      data-testid="web-assistant-lists"
    >
      <button
        hidden={tabbed}
        aria-expanded={!collapsed}
        className="flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
        data-testid="web-assistant-lists-toggle"
        onClick={() => {
          setCollapsed(!collapsed);
          setActive(null);
        }}
        type="button"
      >
        <span className="min-w-0 flex-1 truncate">Lists</span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "size-3.5 shrink-0 transition-transform",
            collapsed && "-rotate-90",
          )}
        />
      </button>
      {!collapsed ? (
        <div className={cn("relative min-h-0 pt-1", tabbed && "flex-1")}>
          <div
            aria-hidden={active != null ? true : undefined}
            className={cn(active != null && "invisible")}
            inert={active != null ? true : undefined}
          >
            <div className="space-y-1 px-2 pt-3 pb-1">
              {CATS.map(({ key, label, icon: Icon }) => {
                const live =
                  (key === "coffee" && s.coffeeLive) ||
                  (key === "thread" && s.threadLive);
                const needsDirect = DIRECT_CATS.has(key) && !s.directLive;
                const count = s[key];
                return (
                  <button
                    className={cn(
                      "inline-flex items-center",
                      RHS_ROW_CLASS,
                      needsDirect && "opacity-50",
                    )}
                    data-testid={`web-assistant-lists-${key}`}
                    key={key}
                    onClick={() => setActive(key)}
                    title={
                      needsDirect
                        ? "Needs Direct (your desktop connected)"
                        : undefined
                    }
                    type="button"
                  >
                    <span className="flex size-4 shrink-0 items-center justify-center text-current">
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-left">
                      {label}
                      {live ? <span className="ml-1 opacity-80">…</span> : null}
                    </span>
                    {needsDirect ? (
                      <span className="shrink-0 text-2xs opacity-70">
                        Needs Direct
                      </span>
                    ) : null}
                    <span className="w-8 shrink-0 text-right tabular-nums text-current opacity-60">
                      {count > 0 ? count : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          {active != null ? (
            <div
              className="absolute inset-0 overflow-y-auto"
              data-testid="web-assistant-lists-sheet"
            >
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 px-1">
                  <button
                    className={cn("inline-flex items-center", PILL)}
                    onClick={() => setActive(null)}
                    type="button"
                  >
                    Back
                  </button>
                  <span className="text-xs font-medium">
                    {CATS.find((c) => c.key === active)?.label}
                  </span>
                </div>
                <SuiteSection
                  category={active}
                  hideHeader
                  me={me}
                  onBack={() => setActive(null)}
                  onNavigate={onNavigate}
                />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
