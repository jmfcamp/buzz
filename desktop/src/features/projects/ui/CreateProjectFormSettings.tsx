import { ChevronDown, Plus } from "lucide-react";
import * as React from "react";

import { ChannelPermissionsSettings } from "@/features/channels/ui/ChannelPermissionsSettings";
import { useCodingAgentOptions } from "@/features/projects/useCodingAgentOptions";
import type { CreateProjectFormSettingsState } from "@/features/projects/ui/useCreateProjectFormSettings";
import { TemplateFormDialog } from "@/features/settings/ui/ChannelTemplatesSettingsCard";
import { Button } from "@/shared/ui/button";
import { UserAvatar } from "@/shared/ui/UserAvatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { cn } from "@/shared/lib/cn";

const NONE_AGENT_VALUE = "__none__";
const NONE_TEAM_VALUE = "__no-team__";
const NO_TEMPLATE_VALUE = "__no-template__";

const SETTINGS_ROW_CLASS =
  "flex min-h-12 items-center justify-between gap-4 rounded-xl border border-input bg-background px-3 py-3";

export function CreateProjectFormSettings({
  disabled,
  handleTemplateChange,
  handleTemplateCreated,
  projectVisibility,
  runtimesAvailable,
  setChannelVisibility,
  setProjectVisibility,
  setTeamId,
  teamId,
  teams,
  templateId,
  templates,
  channelVisibility,
  codingAgentPubkey,
  setCodingAgentPubkey,
}: CreateProjectFormSettingsState & { disabled: boolean }) {
  const {
    failed: codingAgentFailed,
    options: codingAgentOptions,
    ready: codingAgentReady,
  } = useCodingAgentOptions();

  React.useEffect(() => {
    if (!codingAgentReady || !codingAgentPubkey) return;
    if (
      !codingAgentOptions.some((option) => option.pubkey === codingAgentPubkey)
    ) {
      setCodingAgentPubkey("");
    }
  }, [
    codingAgentOptions,
    codingAgentPubkey,
    codingAgentReady,
    setCodingAgentPubkey,
  ]);

  const [isCreateTemplateOpen, setIsCreateTemplateOpen] = React.useState(false);
  const selectedTeam = teams.find((team) => team.id === teamId);
  const selectedTemplate = templates.find(
    (template) => template.id === templateId,
  );
  const selectedCodingAgent = codingAgentOptions.find(
    (option) => option.pubkey === codingAgentPubkey,
  );
  const listingLabel = projectVisibility === "unlisted" ? "Unlisted" : "Listed";
  const agentLabel = selectedCodingAgent?.label ?? "None";
  const teamDisabled = disabled || (!runtimesAvailable && teams.length > 0);

  return (
    <>
      <ChannelPermissionsSettings
        disabled={disabled}
        onVisibilityChange={setChannelVisibility}
        testIdPrefix="create-project-channel"
        visibility={channelVisibility}
      />

      <div className={cn(SETTINGS_ROW_CLASS, disabled && "opacity-50")}>
        <span className="text-sm font-medium text-foreground">
          Template
          <span className="ml-1 text-xs font-normal text-muted-foreground/50">
            Project home by default
          </span>
        </span>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={`Template: ${selectedTemplate?.name ?? "None"}`}
              className="-mr-2.5 ml-auto h-9 min-w-0 max-w-[60%] justify-end px-2.5 text-right text-sm font-medium text-foreground hover:bg-muted/50"
              data-testid="create-project-template"
              disabled={disabled}
              type="button"
              variant="ghost"
            >
              <span className="truncate text-right">
                {selectedTemplate?.name ?? "None"}
              </span>
              <ChevronDown className="size-4 shrink-0 text-muted-foreground/70" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuRadioGroup
              onValueChange={(value) =>
                handleTemplateChange(value === NO_TEMPLATE_VALUE ? "" : value)
              }
              value={templateId || NO_TEMPLATE_VALUE}
            >
              <DropdownMenuRadioItem value={NO_TEMPLATE_VALUE}>
                None
              </DropdownMenuRadioItem>
              {templates.map((template) => (
                <DropdownMenuRadioItem key={template.id} value={template.id}>
                  {template.name}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setIsCreateTemplateOpen(true)}>
              <Plus className="size-4" />
              Create new channel template…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <TemplateFormDialog
          onCreated={handleTemplateCreated}
          onOpenChange={setIsCreateTemplateOpen}
          open={isCreateTemplateOpen}
          template={null}
        />
      </div>

      <div className={cn(SETTINGS_ROW_CLASS, teamDisabled && "opacity-50")}>
        <span className="text-sm font-medium text-foreground">
          Team
          <span className="ml-1 text-xs font-normal text-muted-foreground/50">
            Optional
          </span>
        </span>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={`Team: ${selectedTeam?.name ?? "None"}`}
              className="-mr-2.5 ml-auto h-9 min-w-0 max-w-[60%] justify-end px-2.5 text-right text-sm font-medium text-foreground hover:bg-muted/50"
              data-testid="create-project-team"
              disabled={teamDisabled}
              type="button"
              variant="ghost"
            >
              <span className="truncate text-right">
                {selectedTeam?.name ?? "None"}
              </span>
              <ChevronDown className="size-4 shrink-0 text-muted-foreground/70" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuRadioGroup
              onValueChange={(value) =>
                setTeamId(value === NONE_TEAM_VALUE ? "" : value)
              }
              value={teamId || NONE_TEAM_VALUE}
            >
              <DropdownMenuRadioItem value={NONE_TEAM_VALUE}>
                None
              </DropdownMenuRadioItem>
              {teams.map((team) => (
                <DropdownMenuRadioItem key={team.id} value={team.id}>
                  {team.name}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className={cn(SETTINGS_ROW_CLASS, disabled && "opacity-50")}>
        <span className="text-sm font-medium text-foreground">
          Project list
        </span>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={`Project list: ${listingLabel}`}
              className="-mr-2.5 ml-auto h-9 w-fit justify-end px-2.5 text-right text-sm font-medium text-foreground hover:bg-muted/50"
              data-testid="create-project-listing"
              disabled={disabled}
              type="button"
              variant="ghost"
            >
              <span className="text-right">{listingLabel}</span>
              <ChevronDown className="size-4 shrink-0 text-muted-foreground/70" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            onCloseAutoFocus={(event) => event.preventDefault()}
            style={{
              minWidth: "var(--radix-dropdown-menu-trigger-width)",
            }}
          >
            <DropdownMenuRadioGroup
              onValueChange={(value) =>
                setProjectVisibility(
                  value === "unlisted" ? "unlisted" : "listed",
                )
              }
              value={projectVisibility}
            >
              <DropdownMenuRadioItem
                data-testid="create-project-listing-option-listed"
                value="listed"
              >
                Listed
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem
                data-testid="create-project-listing-option-unlisted"
                value="unlisted"
              >
                Unlisted
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className={cn(SETTINGS_ROW_CLASS, disabled && "opacity-50")}>
        <span className="text-sm font-medium text-foreground">
          Coding agent
        </span>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={`Coding agent: ${agentLabel}`}
              className="-mr-2.5 ml-auto h-9 min-w-0 max-w-[60%] justify-end px-2.5 text-right text-sm font-medium text-foreground hover:bg-muted/50"
              data-testid="create-project-agent"
              disabled={disabled}
              type="button"
              variant="ghost"
            >
              {selectedCodingAgent ? (
                <UserAvatar
                  avatarUrl={selectedCodingAgent.avatarUrl}
                  displayName={selectedCodingAgent.label}
                  shape="squircle"
                  size="xs"
                />
              ) : null}
              <span className="truncate text-right">{agentLabel}</span>
              <ChevronDown className="size-4 shrink-0 text-muted-foreground/70" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="max-h-64 overflow-y-auto"
            onCloseAutoFocus={(event) => event.preventDefault()}
            style={{
              minWidth: "var(--radix-dropdown-menu-trigger-width)",
            }}
          >
            <DropdownMenuRadioGroup
              onValueChange={(value) =>
                setCodingAgentPubkey(value === NONE_AGENT_VALUE ? "" : value)
              }
              value={codingAgentPubkey || NONE_AGENT_VALUE}
            >
              <DropdownMenuRadioItem
                data-testid="create-project-agent-option-none"
                value={NONE_AGENT_VALUE}
              >
                None
              </DropdownMenuRadioItem>
              {codingAgentOptions.map((option) => (
                <DropdownMenuRadioItem
                  className="gap-2"
                  data-testid={`create-project-agent-option-${option.pubkey}`}
                  key={option.pubkey}
                  value={option.pubkey}
                >
                  <UserAvatar
                    avatarUrl={option.avatarUrl}
                    displayName={option.label}
                    shape="squircle"
                    size="xs"
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {option.label}
                  </span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            {!codingAgentReady && !codingAgentFailed ? (
              <DropdownMenuItem disabled>Loading bots…</DropdownMenuItem>
            ) : null}
            {codingAgentFailed ? (
              <DropdownMenuItem disabled>
                Couldn&apos;t load bots.
              </DropdownMenuItem>
            ) : null}
            {codingAgentReady && codingAgentOptions.length === 0 ? (
              <DropdownMenuItem disabled>
                No local or community bots.
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}
