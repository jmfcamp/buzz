import { useFeatureEnabled } from "@/shared/features";

type OpenClawWorkspaceToggleFieldProps = {
  checked: boolean;
  disabled?: boolean;
  id: string;
  onCheckedChange: (value: boolean) => void;
  /** Optional test id override (defaults to the field id). */
  testId?: string;
};

/**
 * Top-level “Use OpenClaw workspace (MCP)” control for create/edit agent forms.
 * Gated by the Hula `openclaw-workspace-mcp` feature flag.
 */
export function OpenClawWorkspaceToggleField({
  checked,
  disabled = false,
  id,
  onCheckedChange,
  testId,
}: OpenClawWorkspaceToggleFieldProps) {
  const enabled = useFeatureEnabled("openclaw-workspace-mcp");
  if (!enabled) return null;

  return (
    <div className="space-y-1.5" data-testid={testId ?? id}>
      <label
        className="flex items-center gap-2 text-sm font-medium"
        htmlFor={id}
      >
        <input
          checked={checked}
          disabled={disabled}
          id={id}
          onChange={(event) => onCheckedChange(event.target.checked)}
          type="checkbox"
        />
        Use OpenClaw workspace (MCP)
      </label>
      <p className="text-xs text-muted-foreground">
        {checked
          ? "Remote OpenClaw FS + skills via MCP (skills_list / skills_get). Local Mac disk is not the workspace."
          : "Local Mac filesystem and local skills. OpenClaw MCP is not attached."}
      </p>
      {checked ? (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Requires a connected OpenClaw workspace grant (Settings → Agents →
          OpenClaw workspace). Without a grant, start will fail with a clear
          error instead of falling back to local disk.
        </p>
      ) : null}
    </div>
  );
}
