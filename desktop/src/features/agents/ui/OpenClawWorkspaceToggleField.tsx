import { useFeatureEnabled } from "@/shared/features";
import { Switch } from "@/shared/ui/switch";

type OpenClawWorkspaceToggleFieldProps = {
  checked: boolean;
  disabled?: boolean;
  id: string;
  onCheckedChange: (value: boolean) => void;
  /** Optional test id override (defaults to the field id). */
  testId?: string;
};

/**
 * Top-level “OpenClaw workspace” control for create/edit agent forms.
 * Gated by the Hula `openclaw-workspace-mcp` feature flag (same as Settings card).
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
    <section
      className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3"
      data-testid={testId ?? id}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-semibold text-foreground">
            OpenClaw workspace
          </p>
          <label
            className="text-sm font-medium text-foreground"
            htmlFor={id}
          >
            Use OpenClaw workspace (MCP)
          </label>
        </div>
        <Switch
          checked={checked}
          disabled={disabled}
          id={id}
          onCheckedChange={onCheckedChange}
        />
      </div>
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
    </section>
  );
}
