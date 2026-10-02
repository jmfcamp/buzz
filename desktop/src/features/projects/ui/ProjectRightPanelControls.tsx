import { Button } from "@/shared/ui/button";
import { DrawerPanelIcon } from "@/shared/ui/DrawerPanelIcon";

export type ProjectRightPanelMode = "chat" | "repository";

export function ProjectRightPanelControls({
  collapsed,
  mode,
  onCollapse,
  onExpand,
  onModeChange,
}: {
  collapsed: boolean;
  mode: ProjectRightPanelMode;
  onCollapse: () => void;
  onExpand: () => void;
  onModeChange: (mode: ProjectRightPanelMode) => void;
}) {
  const repositoryOpen = !collapsed && mode === "repository";

  return (
    <Button
      aria-label={
        repositoryOpen ? "Hide project context" : "Show project context"
      }
      aria-pressed={repositoryOpen}
      className="h-7 w-7 text-sidebar-foreground hover:bg-sidebar-accent"
      data-testid="project-right-panel-repository-tab"
      onClick={() => {
        if (repositoryOpen) {
          onCollapse();
          return;
        }
        onModeChange("repository");
        onExpand();
      }}
      size="icon"
      title="Project context"
      type="button"
      variant="ghost"
    >
      <DrawerPanelIcon
        className="-scale-x-100"
        side={repositoryOpen ? "left" : "right"}
        testId="project-right-panel-repository-icon"
      />
    </Button>
  );
}
