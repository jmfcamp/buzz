import { ChevronDown, ChevronUp, Search } from "lucide-react";
import * as React from "react";

import type { ProjectsSort } from "@/features/projects/lib/projectsViewHelpers";
import { ProjectsSortSelect } from "@/features/projects/ui/ProjectsListHeaderBar";
import { Button } from "@/shared/ui/button";

export function ProjectsSectionSearch({
  onCollapseAll,
  onExpandAll,
  onQueryChange,
  onSortChange,
  sort,
}: {
  onCollapseAll: () => void;
  onExpandAll: () => void;
  onQueryChange: (query: string) => void;
  onSortChange: (sort: ProjectsSort) => void;
  sort: ProjectsSort;
}) {
  const [query, setQuery] = React.useState("");
  const deferredQuery = React.useDeferredValue(query);

  React.useEffect(() => {
    onQueryChange(deferredQuery);
  }, [deferredQuery, onQueryChange]);

  return (
    <div
      className="flex min-w-0 flex-1 items-center gap-1.5"
      data-testid="projects-section-search"
    >
      <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
      <input
        aria-label="Search projects"
        className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/55"
        data-testid="projects-section-search-input"
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          setQuery("");
        }}
        placeholder="Search projects"
        type="search"
        value={query}
      />
      <ProjectsSortSelect onChange={onSortChange} sort={sort} />
      <div className="flex shrink-0 items-center gap-0.5">
        <Button
          aria-label="Expand all project cards"
          className="h-7 w-7 px-0 text-muted-foreground hover:text-foreground"
          data-testid="projects-expand-all"
          onClick={onExpandAll}
          size="icon"
          title="Expand all project cards"
          type="button"
          variant="ghost"
        >
          <ChevronDown className="h-4 w-4" />
        </Button>
        <Button
          aria-label="Collapse all project cards"
          className="h-7 w-7 px-0 text-muted-foreground hover:text-foreground"
          data-testid="projects-collapse-all"
          onClick={onCollapseAll}
          size="icon"
          title="Collapse all project cards"
          type="button"
          variant="ghost"
        >
          <ChevronUp className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
