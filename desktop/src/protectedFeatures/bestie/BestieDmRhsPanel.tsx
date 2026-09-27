import { Bell, Check, ListTodo, Plus, Trash2 } from "lucide-react";
import * as React from "react";

import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import {
  addBestieListItemForScope,
  removeBestieListItemForScope,
  setBestieListItemStatusForScope,
  useBestieList,
} from "./bestieListStore";
import type { BestieListItem, BestieListScope } from "./bestieListTypes";

function Section({
  children,
  icon,
  title,
  testId,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  title: string;
  testId: string;
}) {
  return (
    <section className="space-y-2" data-testid={testId}>
      <div className="flex items-center gap-2 px-0.5 text-xs font-medium text-muted-foreground">
        <span className="flex size-4 items-center justify-center">{icon}</span>
        <h3 className="truncate">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function ListRow({
  item,
  onComplete,
  onRemove,
  onReopen,
}: {
  item: BestieListItem;
  onComplete: () => void;
  onRemove: () => void;
  onReopen: () => void;
}) {
  const done = item.status === "done";
  return (
    <div
      className={cn(
        "group flex items-start gap-2 rounded-md border border-border/60 bg-muted/25 px-2 py-1.5",
        done && "opacity-60",
      )}
      data-testid={`bestie-list-item-${item.id}`}
    >
      <Button
        aria-label={done ? "Reopen item" : "Mark done"}
        className="mt-0.5 size-6 shrink-0"
        data-testid={`bestie-list-toggle-${item.id}`}
        onClick={done ? onReopen : onComplete}
        size="icon-xs"
        type="button"
        variant="ghost"
      >
        <Check className={cn("size-3.5", done && "text-primary")} />
      </Button>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-sm leading-snug",
            done && "line-through text-muted-foreground",
          )}
        >
          {item.text}
        </p>
        {item.kind === "reminder" && item.dueAt != null ? (
          <p className="mt-0.5 text-2xs text-muted-foreground">
            Due {new Date(item.dueAt * 1000).toLocaleString()}
          </p>
        ) : null}
      </div>
      <Button
        aria-label="Remove item"
        className="mt-0.5 size-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        data-testid={`bestie-list-remove-${item.id}`}
        onClick={onRemove}
        size="icon-xs"
        type="button"
        variant="ghost"
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}

function AddRow({
  kind,
  onAdd,
  placeholder,
  testId,
}: {
  kind: BestieListItem["kind"];
  onAdd: (text: string, dueAt: number | null) => void;
  placeholder: string;
  testId: string;
}) {
  const [text, setText] = React.useState("");
  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onAdd(trimmed, kind === "reminder" ? null : null);
    setText("");
  };
  return (
    <div className="flex items-center gap-1.5" data-testid={testId}>
      <Input
        aria-label={placeholder}
        className="h-8 text-sm"
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            submit();
          }
        }}
        placeholder={placeholder}
        value={text}
      />
      <Button
        aria-label={`Add ${kind}`}
        className="size-8 shrink-0"
        disabled={!text.trim()}
        onClick={submit}
        size="icon"
        type="button"
        variant="secondary"
      >
        <Plus className="size-4" />
      </Button>
    </div>
  );
}

export function BestieDmRhsPanel({ scope }: { scope: BestieListScope }) {
  const state = useBestieList(scope);
  const reminders = state.items.filter((item) => item.kind === "reminder");
  const todos = state.items.filter((item) => item.kind === "todo");

  return (
    <div className="flex flex-col gap-5 py-1" data-testid="bestie-dm-rhs-panel">
      <p className="text-xs text-muted-foreground">
        Reminders and to-dos for this Bestie. Your agent can add items from chat
        with a <code className="text-2xs">bestie-list</code> fence.
      </p>

      <Section
        icon={<Bell className="size-3.5" />}
        testId="bestie-rhs-reminders"
        title="Reminders"
      >
        <AddRow
          kind="reminder"
          onAdd={(text) =>
            addBestieListItemForScope(scope, { kind: "reminder", text })
          }
          placeholder="Add a reminder"
          testId="bestie-add-reminder"
        />
        <div className="space-y-1.5">
          {reminders.length === 0 ? (
            <p className="px-0.5 text-xs text-muted-foreground">
              No reminders yet.
            </p>
          ) : (
            reminders.map((item) => (
              <ListRow
                key={item.id}
                item={item}
                onComplete={() =>
                  setBestieListItemStatusForScope(scope, item.id, "done")
                }
                onRemove={() => removeBestieListItemForScope(scope, item.id)}
                onReopen={() =>
                  setBestieListItemStatusForScope(scope, item.id, "open")
                }
              />
            ))
          )}
        </div>
      </Section>

      <Section
        icon={<ListTodo className="size-3.5" />}
        testId="bestie-rhs-todos"
        title="To-dos"
      >
        <AddRow
          kind="todo"
          onAdd={(text) =>
            addBestieListItemForScope(scope, { kind: "todo", text })
          }
          placeholder="Add a to-do"
          testId="bestie-add-todo"
        />
        <div className="space-y-1.5">
          {todos.length === 0 ? (
            <p className="px-0.5 text-xs text-muted-foreground">
              No to-dos yet.
            </p>
          ) : (
            todos.map((item) => (
              <ListRow
                key={item.id}
                item={item}
                onComplete={() =>
                  setBestieListItemStatusForScope(scope, item.id, "done")
                }
                onRemove={() => removeBestieListItemForScope(scope, item.id)}
                onReopen={() =>
                  setBestieListItemStatusForScope(scope, item.id, "open")
                }
              />
            ))
          )}
        </div>
      </Section>
    </div>
  );
}
