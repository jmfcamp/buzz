import * as React from "react";

import { hulaFindErrorMessage } from "@/features/projects/lib/hulaCreateForm";
import { resolveHulaProjectDirectory } from "@/features/projects/lib/hulaProjectResolve";
import type { ResolvedHulaProject } from "@/features/projects/lib/hulaProjectResolve";
import { openClawWorkspaceClient } from "@/features/projects/lib/openClawWorkspaceClient";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";

export function CreateProjectPathField({
  disabled,
  fieldClassName,
  inputClassName,
  onFindError,
  onResolving,
  onResolved,
  path,
  resolvedPath,
  setPath,
}: {
  disabled: boolean;
  fieldClassName: string;
  inputClassName: string;
  onFindError: (message: string | null) => void;
  onResolving: (resolving: boolean) => void;
  onResolved: (resolved: ResolvedHulaProject) => void;
  path: string;
  resolvedPath: string | null;
  setPath: (path: string) => void;
}) {
  const [resolving, setResolving] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const timerId = globalThis.setTimeout(() => {
      inputRef.current?.focus({ preventScroll: true });
      const body = inputRef.current?.closest(
        "[data-testid='create-project-body']",
      );
      if (body instanceof HTMLElement) body.scrollTop = 0;
    }, 50);
    return () => globalThis.clearTimeout(timerId);
  }, []);

  async function findProject() {
    setResolving(true);
    onResolving(true);
    onFindError(null);
    try {
      const resolved = await resolveHulaProjectDirectory(
        path,
        openClawWorkspaceClient,
      );
      onResolved(resolved);
    } catch (error) {
      onFindError(hulaFindErrorMessage(error));
    } finally {
      setResolving(false);
      onResolving(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <label
        className="text-sm font-medium text-foreground"
        htmlFor="create-project-path"
      >
        Hula path
        <span className="ml-1 text-xs font-normal text-muted-foreground/50">
          Optional
        </span>
      </label>
      <div
        className={cn("flex min-h-11 items-center gap-2 px-3", fieldClassName)}
      >
        <Input
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect="off"
          className={cn(
            "h-8 min-w-0 flex-1 px-0 py-0 leading-6",
            inputClassName,
          )}
          data-testid="create-project-path"
          disabled={disabled || resolving}
          id="create-project-path"
          onChange={(event) => {
            setPath(event.target.value);
            onFindError(null);
          }}
          placeholder="Hula/projects/claimminer or a Porthole link"
          ref={inputRef}
          spellCheck={false}
          value={path}
        />
        <Button
          data-testid="create-project-find"
          disabled={disabled || resolving || path.trim().length === 0}
          onClick={() => {
            void findProject();
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          {resolving ? "Finding..." : "Find project"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {resolvedPath
          ? resolvedPath
          : "A git directory inside Hula. Leave this empty to create a project by name."}
      </p>
    </div>
  );
}
