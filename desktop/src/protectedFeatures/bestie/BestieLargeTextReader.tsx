import { Maximize2, X } from "lucide-react";
import * as React from "react";
import { createPortal } from "react-dom";

import { cn } from "@/shared/lib/cn";
import { isMacPlatform } from "@/shared/lib/platform";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Textarea } from "@/shared/ui/textarea";
import { bestieScratchChord } from "./bestieScratchHotkeys";
import {
  BESTIE_LARGE_TEXT_ROOT_ATTR,
  bestieLargeTextOpenLabel,
} from "./bestieLargeTextTarget";

/**
 * Per-row fullscreen control for one coffee, thread summary, or scratch note.
 * The compact row stays scannable. The icon opens that item over the app.
 */
export function BestieLargeTextOpenButton({
  label,
  onOpen,
  open,
  testId,
}: {
  label: string;
  onOpen: () => void;
  open: boolean;
  testId: string;
}) {
  const fullscreenName = bestieLargeTextOpenLabel(label);
  return (
    <div className="mt-0.5 flex shrink-0 items-center">
      <Button
        aria-label={fullscreenName}
        aria-pressed={open}
        className="size-6"
        data-testid={`${testId}-fullscreen`}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onOpen();
        }}
        size="icon-xs"
        title={fullscreenName}
        type="button"
        variant={open ? "secondary" : "ghost"}
      >
        <Maximize2 aria-hidden="true" className="size-3.5" />
      </Button>
    </div>
  );
}

/**
 * Full-screen reading surface for one coffee briefing, thread summary, or
 * scratch note. The Assistant list stays mounted underneath.
 */
export function BestieLargeTextReader({
  body,
  children,
  editable = false,
  mono = false,
  onClose,
  onDismiss,
  onSave,
  onSaveAndClose,
  title,
}: {
  body: string;
  children?: React.ReactNode;
  editable?: boolean;
  mono?: boolean;
  onClose: () => void;
  /**
   * Click outside, Escape, or the close button. Scratch uses this to keep
   * the text as a draft. Read-only kinds omit it and only close.
   */
  onDismiss?: (next: { body: string; title: string }) => void;
  /** Explicit save. Clears a scratch draft. Read-only kinds omit this. */
  onSave?: (next: { body: string; draft?: boolean; title: string }) => void;
  /**
   * Command+Shift+Enter. Runs after the note is saved.
   * Editors use this to leave the note. The create form uses it to close.
   */
  onSaveAndClose?: () => void;
  title: string;
}) {
  const [titleDraft, setTitleDraft] = React.useState(title);
  const [bodyDraft, setBodyDraft] = React.useState(body);
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();

  const persist = React.useCallback(
    (force = false) => {
      if (!editable || !onSave) return;
      const nextTitle = titleDraft.trim();
      if (!force && nextTitle === title.trim() && bodyDraft === body) return;
      onSave({ body: bodyDraft, draft: false, title: nextTitle });
    },
    [body, bodyDraft, editable, onSave, title, titleDraft],
  );

  const close = React.useCallback(() => {
    if (editable && onDismiss) {
      onDismiss({ body: bodyDraft, title: titleDraft.trim() });
    } else {
      persist();
    }
    onClose();
  }, [bodyDraft, editable, onClose, onDismiss, persist, titleDraft]);

  const saveAndClose = React.useCallback(() => {
    if (editable && onSave && onSaveAndClose) {
      // The fields behind this reader may already hold the text. That text
      // is still unsaved on a new note, so this chord always hands it over.
      onSave({ body: bodyDraft, draft: false, title: titleDraft.trim() });
      onSaveAndClose();
      return;
    }
    persist(true);
    onClose();
  }, [
    bodyDraft,
    editable,
    onClose,
    onSave,
    onSaveAndClose,
    persist,
    titleDraft,
  ]);

  React.useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const chord = bestieScratchChord(event);
      if (chord && editable) {
        event.preventDefault();
        event.stopPropagation();
        if (chord === "save-close") saveAndClose();
        return;
      }
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      close();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [close, editable, saveAndClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      {...{ [BESTIE_LARGE_TEXT_ROOT_ATTR]: "" }}
      className="fixed inset-0 z-[400]"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/60"
        data-testid="bestie-large-text-shade"
        style={{ top: "var(--buzz-top-chrome-height, 40px)" }}
      />
      <button
        aria-label="Close reading view"
        className="absolute inset-0 z-0 cursor-default bg-transparent"
        data-testid="bestie-large-text-backdrop"
        onClick={close}
        tabIndex={-1}
        type="button"
      />
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="absolute inset-x-3 bottom-3 z-[401] flex flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl outline-hidden"
        data-mode="fullscreen"
        data-testid="bestie-large-text-reader"
        ref={dialogRef}
        role="dialog"
        style={{
          top: "calc(var(--buzz-top-chrome-height, 40px) + 0.75rem)",
        }}
        tabIndex={-1}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
          <h2
            className="min-w-0 flex-1 truncate text-sm font-medium"
            id={titleId}
          >
            {editable ? titleDraft.trim() || title : title}
          </h2>
          <Button
            aria-label="Close"
            className="size-7"
            data-testid="bestie-large-text-close"
            onClick={close}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" className="size-3.5" />
          </Button>
        </div>
        {editable ? (
          <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
            <Input
              aria-label="Title"
              className="h-8 text-sm"
              data-testid="bestie-large-text-title-input"
              onChange={(event) => setTitleDraft(event.target.value)}
              value={titleDraft}
            />
            <Textarea
              aria-label="Note"
              className="min-h-0 flex-1 resize-none text-sm"
              data-testid="bestie-large-text-body"
              onChange={(event) => setBodyDraft(event.target.value)}
              value={bodyDraft}
            />
            <div className="flex items-center justify-end gap-2">
              <p className="mr-auto text-2xs text-muted-foreground">
                {isMacPlatform()
                  ? "⌘⇧↩ saves and closes"
                  : "Ctrl+Shift+Enter saves and closes"}
              </p>
              <Button
                className="h-7 px-2 text-xs"
                data-testid="bestie-large-text-save"
                onClick={() => persist(true)}
                size="xs"
                type="button"
                variant="secondary"
              >
                Save
              </Button>
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {children ?? (
            <pre
              className={cn(
                "whitespace-pre-wrap text-sm leading-normal text-foreground",
                mono && "font-mono",
              )}
              data-testid="bestie-large-text-body"
            >
              {body}
            </pre>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
