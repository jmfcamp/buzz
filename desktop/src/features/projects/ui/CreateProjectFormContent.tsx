import { ArrowLeft } from "lucide-react";
import * as React from "react";

import {
  hulaCreateAttachment,
  projectFormErrorMessage,
} from "@/features/projects/lib/hulaCreateForm";
import {
  allocateDisplayName,
  projectNameFromHulaPath,
} from "@/features/projects/lib/hulaProjectNames";
import type { ResolvedHulaProject } from "@/features/projects/lib/hulaProjectResolve";
import { useProjectsQuery } from "@/features/projects/hooks";
import type { CreateProjectInput } from "@/features/projects/useCreateProject";
import { CreateProjectFormSettings } from "@/features/projects/ui/CreateProjectFormSettings";
import { ProjectDriField } from "@/features/projects/ui/ProjectDriField";
import { CreateProjectPathField } from "@/features/projects/ui/CreateProjectPathField";
import { useCreateProjectFormSettings } from "@/features/projects/ui/useCreateProjectFormSettings";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import { ChooserDialogContent } from "@/shared/ui/chooser-dialog-content";
import { Input } from "@/shared/ui/input";
import { Textarea } from "@/shared/ui/textarea";

const CREATE_FIELD_SHELL_CLASS =
  "rounded-xl border border-input bg-muted/40 transition-colors duration-150 ease-out hover:border-muted-foreground/40 focus-within:border-muted-foreground/50";
const CREATE_FIELD_CONTROL_CLASS =
  "border-0 bg-transparent text-muted-foreground/55 shadow-none outline-none ring-0 transition-colors duration-150 ease-out placeholder:text-muted-foreground/55 focus:bg-transparent focus:text-foreground focus:outline-hidden focus-visible:ring-0";
const CREATE_LABEL_OPTIONAL_CLASS =
  "ml-1 text-xs font-normal text-muted-foreground/50";

export function CreateProjectFormContent({
  active,
  initialName = "",
  isCreating,
  onBack,
  onCreate,
  onCreated,
}: {
  active: boolean;
  initialName?: string;
  isCreating: boolean;
  onBack?: () => void;
  onCreate: (input: CreateProjectInput) => Promise<void>;
  onCreated: () => void;
}) {
  const [name, setName] = React.useState("");
  const [nameTouched, setNameTouched] = React.useState(false);
  const [path, setPath] = React.useState("");
  const [resolved, setResolved] = React.useState<ResolvedHulaProject | null>(
    null,
  );
  const [resolving, setResolving] = React.useState(false);
  const [description, setDescription] = React.useState("");
  const [driPubkey, setDriPubkey] = React.useState("");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const settings = useCreateProjectFormSettings(active, setDescription);
  const projectsQuery = useProjectsQuery();
  const pathPending = path.trim().length > 0 && resolved === null;

  React.useEffect(() => {
    if (!active) return;
    setName(initialName);
    setNameTouched(initialName.trim().length > 0);
    setPath("");
    setResolved(null);
    setResolving(false);
    setDescription("");
    setDriPubkey("");
    setErrorMessage(null);
  }, [active, initialName]);

  function handleResolved(next: ResolvedHulaProject) {
    setResolved(next);
    if (nameTouched) return;
    const derived = projectNameFromHulaPath(next.hulaPath);
    const taken = (projectsQuery.data ?? []).map((project) => project.name);
    const suggested = derived ? allocateDisplayName(derived, taken) : null;
    if (suggested) setName(suggested);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const attachment = hulaCreateAttachment(path, resolved);
    if (attachment.error) {
      setErrorMessage(attachment.error);
      return;
    }
    if (!driPubkey) {
      setErrorMessage("Choose a directly responsible individual.");
      return;
    }

    setErrorMessage(null);
    try {
      await onCreate({
        name: trimmedName,
        description: description.trim() || undefined,
        channelVisibility: settings.channelVisibility,
        projectVisibility: settings.projectVisibility,
        agents: settings.buildAgents(),
        templateId: settings.templateId,
        hula: attachment.hula,
        driPubkey,
        codingAgentPubkey: settings.codingAgentPubkey || undefined,
      });
      onCreated();
    } catch (error) {
      setErrorMessage(projectFormErrorMessage(error));
    }
  }

  return (
    <ChooserDialogContent
      className="max-w-lg"
      contentClassName="pt-3"
      data-testid="create-project-dialog"
      scrollAreaTestId="create-project-body"
      headerSubtitle="Point at a git directory inside Hula, or name a project and Buzz will create its channel."
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          {errorMessage ? (
            <p className="min-w-0 text-sm text-destructive" role="alert">
              {errorMessage}
            </p>
          ) : (
            <span />
          )}
          <Button
            className="shrink-0"
            data-testid="create-project-submit"
            disabled={
              isCreating ||
              resolving ||
              name.trim().length === 0 ||
              pathPending ||
              driPubkey.length === 0
            }
            form="create-project-form"
            type="submit"
          >
            {isCreating ? "Creating..." : "Create project"}
          </Button>
        </div>
      }
      footerClassName="border-t-0 pt-0"
      headerClassName="pb-2"
      title="Create a new project"
    >
      {onBack ? (
        <Button
          className="mb-3 h-8 gap-1.5 px-2 text-muted-foreground"
          disabled={isCreating}
          onClick={onBack}
          size="sm"
          type="button"
          variant="ghost"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to projects
        </Button>
      ) : null}
      <form
        className="space-y-5"
        id="create-project-form"
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        <CreateProjectPathField
          disabled={isCreating}
          fieldClassName={CREATE_FIELD_SHELL_CLASS}
          inputClassName={CREATE_FIELD_CONTROL_CLASS}
          onFindError={setErrorMessage}
          onResolving={setResolving}
          onResolved={handleResolved}
          path={path}
          resolvedPath={resolved?.hulaPath ?? null}
          setPath={(value) => {
            setPath(value);
            setResolved(null);
            setErrorMessage(null);
          }}
        />

        <div className="space-y-1.5">
          <label
            className="text-sm font-medium text-foreground"
            htmlFor="create-project-name"
          >
            Name
          </label>
          <div
            className={cn(
              "flex min-h-11 items-center px-3",
              CREATE_FIELD_SHELL_CLASS,
            )}
          >
            <Input
              autoCapitalize="none"
              autoComplete="off"
              autoCorrect="off"
              className={cn(
                "h-8 min-w-0 flex-1 px-0 py-0 leading-6",
                CREATE_FIELD_CONTROL_CLASS,
              )}
              data-testid="create-project-name"
              disabled={isCreating}
              id="create-project-name"
              onChange={(event) => {
                setName(event.target.value);
                setNameTouched(true);
                setErrorMessage(null);
              }}
              placeholder="bee-garden-game"
              spellCheck={false}
              value={name}
            />
          </div>
        </div>

        <ProjectDriField
          disabled={isCreating}
          fieldClassName={CREATE_FIELD_SHELL_CLASS}
          inputClassName={CREATE_FIELD_CONTROL_CLASS}
          onChange={(pubkey) => {
            setDriPubkey(pubkey);
            setErrorMessage(null);
          }}
          value={driPubkey}
        />

        <div className="space-y-1.5">
          <label
            className="text-sm font-medium text-foreground"
            htmlFor="create-project-description"
          >
            Description
            <span className={CREATE_LABEL_OPTIONAL_CLASS}>Optional</span>
          </label>
          <div className={CREATE_FIELD_SHELL_CLASS}>
            <Textarea
              className={cn(
                "min-h-20 resize-none px-3 py-3 leading-5",
                CREATE_FIELD_CONTROL_CLASS,
              )}
              data-testid="create-project-description"
              disabled={isCreating}
              id="create-project-description"
              onChange={(event) => {
                setDescription(event.target.value);
                setErrorMessage(null);
              }}
              placeholder="What this project should become"
              rows={2}
              value={description}
            />
          </div>
        </div>

        <CreateProjectFormSettings disabled={isCreating} {...settings} />
      </form>
    </ChooserDialogContent>
  );
}
