import { StickyNote, Trash2 } from "lucide-react";
import * as React from "react";

import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Textarea } from "@/shared/ui/textarea";
import {
  BestieLargeTextOpenButton,
  BestieLargeTextReader,
} from "./BestieLargeTextReader";
import { bestieScratchChord } from "./bestieScratchHotkeys";

import {
  bestieScratchSnippet,
  deriveBestieScratchTitle,
} from "./bestieScratchStorage";
import {
  addBestieScratchNoteForScope,
  removeBestieScratchNoteForScope,
  updateBestieScratchNoteForScope,
  useBestieScratch,
} from "./bestieScratchStore";
import type {
  BestieScratchNote,
  BestieScratchScope,
} from "./bestieScratchTypes";

function ScratchDraftChip({ id }: { id: string }) {
  return (
    <span
      className="shrink-0 rounded-full bg-muted px-1.5 font-normal text-2xs text-muted-foreground"
      data-testid={`bestie-scratch-draft-${id}`}
    >
      Draft
    </span>
  );
}

function ScratchListRow({
  note,
  onOpen,
  onRemove,
  onSave,
  readerOpenRef,
}: {
  note: BestieScratchNote;
  onOpen: () => void;
  onRemove: () => void;
  onSave: (input: { body: string; draft?: boolean; title: string }) => void;
  readerOpenRef: React.MutableRefObject<boolean>;
}) {
  const snippet = bestieScratchSnippet(note.body);
  const [reading, setReading] = React.useState(false);
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);
  const deleteRef = React.useRef<HTMLButtonElement>(null);
  useScratchReaderFlag(readerOpenRef, reading);
  React.useEffect(() => {
    if (!confirmingDelete) return;
    const onPointerDown = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && deleteRef.current?.contains(target)) {
        return;
      }
      setConfirmingDelete(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("mousedown", onPointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("mousedown", onPointerDown, true);
    };
  }, [confirmingDelete]);
  const isDraft = note.draft === true;
  return (
    <div
      className="group flex items-start gap-2 rounded-md border border-border/60 bg-muted/25 px-2 py-1.5"
      data-testid={`bestie-scratch-item-${note.id}`}
    >
      <button
        className="min-w-0 flex-1 text-left"
        data-testid={`bestie-scratch-open-${note.id}`}
        onClick={onOpen}
        type="button"
      >
        <p className="flex items-center gap-1.5 text-sm font-medium leading-snug">
          <StickyNote className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{note.title}</span>
          {isDraft ? <ScratchDraftChip id={note.id} /> : null}
        </p>
        {snippet && snippet !== note.title ? (
          <p className="mt-0.5 line-clamp-2 text-2xs text-muted-foreground">
            {snippet}
          </p>
        ) : null}
      </button>
      <BestieLargeTextOpenButton
        label={note.title}
        onOpen={() => setReading(true)}
        open={reading}
        testId={`bestie-large-text-open-${note.id}`}
      />
      <Button
        aria-label={
          confirmingDelete
            ? "Confirm delete scratch note"
            : "Delete scratch note"
        }
        className={cn(
          "mt-0.5 shrink-0",
          confirmingDelete
            ? "text-destructive opacity-100"
            : "opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100",
        )}
        data-confirming={confirmingDelete ? "true" : "false"}
        data-testid={`bestie-scratch-remove-${note.id}`}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!isDraft && !confirmingDelete) {
            setConfirmingDelete(true);
            return;
          }
          onRemove();
        }}
        ref={deleteRef}
        size={confirmingDelete ? "xs" : "icon-xs"}
        type="button"
        variant="ghost"
      >
        <Trash2 className="size-3.5" />
        {confirmingDelete ? "Delete" : null}
      </Button>
      {reading ? (
        <BestieLargeTextReader
          body={note.body}
          editable
          onClose={() => setReading(false)}
          onDismiss={(input) => {
            const nextTitle = input.title.trim();
            const nextBody = input.body;
            if (!nextTitle && !nextBody.trim()) return;
            const unchanged =
              nextTitle === note.title.trim() && nextBody === note.body;
            if (unchanged && !note.draft) return;
            onSave({
              body: nextBody,
              draft: true,
              title: nextTitle || deriveBestieScratchTitle(nextBody),
            });
          }}
          onSave={onSave}
          title={note.title}
        />
      ) : null}
    </div>
  );
}

const SCRATCH_BODY_MIN_PX = 112; // ~min-h-28
const SCRATCH_BODY_DEFAULT_PX = 160;
const SCRATCH_BODY_MAX_PX = 480; // stay inside the Lists sheet

function useScratchReaderFlag(
  readerOpenRef: React.MutableRefObject<boolean>,
  reading: boolean,
) {
  React.useLayoutEffect(() => {
    if (!reading) return;
    readerOpenRef.current = true;
    return () => {
      readerOpenRef.current = false;
    };
  }, [readerOpenRef, reading]);
}

function ScratchEditor({
  note,
  onClose,
  onPersist,
  readerOpenRef,
  saveAndCloseRef,
}: {
  note: BestieScratchNote;
  onClose: () => void;
  onPersist: (input: { body: string; draft?: boolean; title: string }) => void;
  readerOpenRef: React.MutableRefObject<boolean>;
  saveAndCloseRef: React.MutableRefObject<(() => void) | null>;
}) {
  const [title, setTitle] = React.useState(note.title);
  const [body, setBody] = React.useState(note.body);
  const [bodyHeight, setBodyHeight] = React.useState(SCRATCH_BODY_DEFAULT_PX);
  const [reading, setReading] = React.useState(false);
  const titleRef = React.useRef<HTMLInputElement>(null);
  const dragRef = React.useRef<{ startY: number; startH: number } | null>(null);
  useScratchReaderFlag(readerOpenRef, reading);
  React.useEffect(() => {
    titleRef.current?.focus();
    setBodyHeight(SCRATCH_BODY_DEFAULT_PX);
  }, [note.id]);

  const persist = () => {
    onPersist({
      body,
      draft: false,
      title: title.trim() || deriveBestieScratchTitle(body),
    });
  };
  const saveAndClose = () => {
    persist();
    onClose();
  };
  saveAndCloseRef.current = saveAndClose;
  React.useEffect(() => {
    return () => {
      saveAndCloseRef.current = null;
    };
  }, [saveAndCloseRef]);

  const onResizePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragRef.current = { startY: event.clientY, startH: bodyHeight };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onResizePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const next = Math.min(
      SCRATCH_BODY_MAX_PX,
      Math.max(
        SCRATCH_BODY_MIN_PX,
        drag.startH + (event.clientY - drag.startY),
      ),
    );
    setBodyHeight(next);
  };
  const onResizePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div
      className="flex flex-col gap-1.5 rounded-md border border-border/60 bg-muted/25 p-2"
      data-testid={`bestie-scratch-editor-${note.id}`}
    >
      <Input
        aria-label="Scratch title"
        className="h-8 text-sm"
        data-testid="bestie-scratch-title"
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
        }}
        placeholder="Title"
        ref={titleRef}
        value={title}
      />
      <Textarea
        aria-label="Scratch body"
        className="resize-none overflow-y-auto text-sm"
        data-testid="bestie-scratch-body"
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
        }}
        placeholder="Notes…"
        style={{ height: bodyHeight }}
        value={body}
      />
      <div
        aria-label="Drag to resize note"
        className="flex h-3 cursor-ns-resize items-center justify-center rounded-sm hover:bg-muted/60"
        data-testid="bestie-scratch-resize"
        onPointerDown={onResizePointerDown}
        onPointerMove={onResizePointerMove}
        onPointerUp={onResizePointerUp}
        onPointerCancel={onResizePointerUp}
        role="separator"
        title="Drag to make taller"
      >
        <span className="h-0.5 w-8 rounded-full bg-border" />
      </div>
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5">
          {note.draft ? <ScratchDraftChip id={note.id} /> : null}
          <BestieLargeTextOpenButton
            label={title.trim() || note.title}
            onOpen={() => setReading(true)}
            open={reading}
            testId={`bestie-large-text-open-${note.id}`}
          />
          <Button
            className="h-7 px-2 text-xs"
            data-testid="bestie-scratch-expand"
            onClick={() =>
              setBodyHeight((h) => Math.min(SCRATCH_BODY_MAX_PX, h + 96))
            }
            size="sm"
            type="button"
            variant="ghost"
          >
            Read more
          </Button>
        </div>
        <div className="flex gap-1.5">
          <Button
            className="h-7 px-2 text-xs"
            data-testid="bestie-scratch-cancel"
            onClick={onClose}
            size="sm"
            type="button"
            variant="ghost"
          >
            Close
          </Button>
          <Button
            className="h-7 px-2 text-xs"
            data-testid="bestie-scratch-save"
            onClick={saveAndClose}
            size="sm"
            type="button"
            variant="secondary"
          >
            Save
          </Button>
        </div>
      </div>
      {reading ? (
        <BestieLargeTextReader
          body={body}
          editable
          onClose={() => setReading(false)}
          onDismiss={(input) => {
            const nextTitle = input.title.trim();
            const nextBody = input.body;
            if (!nextTitle && !nextBody.trim()) return;
            const unchanged =
              nextTitle === note.title.trim() && nextBody === note.body;
            if (unchanged && !note.draft) return;
            const titleText = nextTitle || deriveBestieScratchTitle(nextBody);
            setTitle(titleText);
            setBody(nextBody);
            onPersist({ body: nextBody, draft: true, title: titleText });
          }}
          onSave={(input) => {
            const titleText =
              input.title.trim() || deriveBestieScratchTitle(input.body);
            setTitle(titleText);
            setBody(input.body);
            onPersist({
              body: input.body,
              draft: false,
              title: titleText,
            });
          }}
          onSaveAndClose={onClose}
          title={title}
        />
      ) : null}
    </div>
  );
}

function AddScratchRow({
  onAdd,
  onCancel,
  onStartFullscreenConsumed,
  openFullscreenRef,
  readerOpenRef,
  saveAndCloseRef,
  startFullscreen,
}: {
  onAdd: (input: { body: string; draft?: boolean; title: string }) => void;
  onCancel: () => void;
  onStartFullscreenConsumed: () => void;
  openFullscreenRef: React.MutableRefObject<(() => void) | null>;
  readerOpenRef: React.MutableRefObject<boolean>;
  saveAndCloseRef: React.MutableRefObject<(() => void) | null>;
  startFullscreen: boolean;
}) {
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [reading, setReading] = React.useState(false);
  const titleRef = React.useRef<HTMLInputElement>(null);
  useScratchReaderFlag(readerOpenRef, reading);
  React.useEffect(() => {
    titleRef.current?.focus();
  }, []);
  React.useLayoutEffect(() => {
    if (!startFullscreen) return;
    setReading(true);
    onStartFullscreenConsumed();
  }, [onStartFullscreenConsumed, startFullscreen]);

  const submit = (closeIfEmpty = false) => {
    const nextTitle = title.trim();
    const nextBody = body.trimEnd();
    if (!nextTitle && !nextBody.trim()) {
      if (closeIfEmpty) onCancel();
      return;
    }
    onAdd({
      body: nextBody,
      title: nextTitle || deriveBestieScratchTitle(nextBody),
    });
    setTitle("");
    setBody("");
  };
  const saveAndClose = () => submit(true);
  saveAndCloseRef.current = saveAndClose;
  openFullscreenRef.current = () => setReading(true);
  React.useEffect(() => {
    return () => {
      saveAndCloseRef.current = null;
      openFullscreenRef.current = null;
    };
  }, [openFullscreenRef, saveAndCloseRef]);

  return (
    <div className="flex flex-col gap-1.5" data-testid="bestie-add-scratch">
      <Input
        aria-label="Scratch title"
        className="h-8 text-sm"
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Title"
        ref={titleRef}
        value={title}
      />
      <Textarea
        aria-label="Scratch body"
        className="min-h-20 resize-none text-sm"
        onChange={(event) => setBody(event.target.value)}
        placeholder="Park a thought…"
        value={body}
      />
      <div className="flex items-center justify-between gap-1.5">
        <BestieLargeTextOpenButton
          label={title.trim() || "New scratch note"}
          onOpen={() => setReading(true)}
          open={reading}
          testId="bestie-large-text-open-draft"
        />
        <Button
          className="h-7 px-2 text-xs"
          data-testid="bestie-add-scratch-submit"
          disabled={!title.trim() && !body.trim()}
          onClick={() => submit(false)}
          size="sm"
          type="button"
          variant="secondary"
        >
          Add
        </Button>
      </div>
      {reading ? (
        <BestieLargeTextReader
          body={body}
          editable
          onClose={() => {
            setReading(false);
            onCancel();
          }}
          onDismiss={(input) => {
            const nextBody = input.body.trimEnd();
            const nextTitle = input.title.trim();
            if (!nextTitle && !nextBody.trim()) return;
            onAdd({
              body: nextBody,
              draft: true,
              title: nextTitle || deriveBestieScratchTitle(nextBody),
            });
          }}
          onSave={(input) => {
            const nextBody = input.body.trimEnd();
            const nextTitle = input.title.trim();
            if (!nextTitle && !nextBody.trim()) return;
            onAdd({
              body: nextBody,
              draft: false,
              title: nextTitle || deriveBestieScratchTitle(nextBody),
            });
          }}
          onSaveAndClose={onCancel}
          title={title}
        />
      ) : null}
    </div>
  );
}

/**
 * Scratch category sheet — lightweight personal pad (title/snippet list,
 * click to edit body). Not a wiki.
 */
export function BestieDmScratchSheet({
  adding,
  onAdded,
  onRequestAdd,
  scope,
}: {
  adding: boolean;
  /** Close the add form after a successful create — user must click Add again. */
  onAdded?: () => void;
  onRequestAdd?: () => void;
  scope: BestieScratchScope;
}) {
  const state = useBestieScratch(scope);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [startCreateFullscreen, setStartCreateFullscreen] =
    React.useState(false);
  const editing = state.notes.find((note) => note.id === editingId) ?? null;
  const readerOpenRef = React.useRef(false);
  const openCreateFullscreenRef = React.useRef<(() => void) | null>(null);
  const saveCreateRef = React.useRef<(() => void) | null>(null);
  const saveEditorRef = React.useRef<(() => void) | null>(null);
  const consumeCreateFullscreen = React.useCallback(() => {
    setStartCreateFullscreen(false);
  }, []);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const chord = bestieScratchChord(event);
      if (!chord || event.defaultPrevented || readerOpenRef.current) return;
      if (chord === "new") {
        if (editingId) return;
        event.preventDefault();
        event.stopPropagation();
        if (adding) {
          openCreateFullscreenRef.current?.();
          return;
        }
        setStartCreateFullscreen(true);
        onRequestAdd?.();
        return;
      }
      if (!editingId && !adding) return;
      event.preventDefault();
      event.stopPropagation();
      if (editingId) saveEditorRef.current?.();
      else saveCreateRef.current?.();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [adding, editingId, onRequestAdd]);

  return (
    <div
      className="flex flex-col gap-3 py-1"
      data-testid="bestie-dm-scratch-sheet"
    >
      {editing ? (
        <ScratchEditor
          note={editing}
          onClose={() => setEditingId(null)}
          onPersist={(input) => {
            updateBestieScratchNoteForScope(scope, {
              body: input.body,
              draft: input.draft,
              id: editing.id,
              title: input.title,
            });
          }}
          readerOpenRef={readerOpenRef}
          saveAndCloseRef={saveEditorRef}
        />
      ) : (
        <>
          {adding ? (
            <AddScratchRow
              onAdd={(input) => {
                addBestieScratchNoteForScope(scope, input);
                onAdded?.();
              }}
              onCancel={() => onAdded?.()}
              onStartFullscreenConsumed={consumeCreateFullscreen}
              openFullscreenRef={openCreateFullscreenRef}
              readerOpenRef={readerOpenRef}
              saveAndCloseRef={saveCreateRef}
              startFullscreen={startCreateFullscreen}
            />
          ) : (
            <p className="px-0.5 text-xs text-muted-foreground">
              Lightweight personal pad — park a thought, not a wiki. Use + to
              add, or ask Assistant to{" "}
              <code className="text-2xs">park this: …</code>
              {onRequestAdd ? (
                <>
                  {" "}
                  <button
                    className="underline-offset-2 hover:underline"
                    onClick={onRequestAdd}
                    type="button"
                  >
                    Add one
                  </button>
                </>
              ) : null}
            </p>
          )}
          <div className="space-y-1.5">
            {state.notes.length === 0 ? (
              <p className="px-0.5 text-xs text-muted-foreground">
                No scratch notes yet.
              </p>
            ) : (
              state.notes.map((note) => (
                <ScratchListRow
                  key={note.id}
                  note={note}
                  onOpen={() => setEditingId(note.id)}
                  onRemove={() => {
                    removeBestieScratchNoteForScope(scope, note.id);
                  }}
                  readerOpenRef={readerOpenRef}
                  onSave={(input) => {
                    updateBestieScratchNoteForScope(scope, {
                      body: input.body,
                      draft: input.draft,
                      id: note.id,
                      title: input.title,
                    });
                  }}
                />
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
