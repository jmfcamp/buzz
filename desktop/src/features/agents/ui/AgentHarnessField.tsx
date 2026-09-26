import type { ReactNode } from "react";

import type { PersonaDropdownOption } from "./agentConfigOptions";
import { PersonaDropdownField } from "./PersonaDropdownField";
import { HarnessCatalogRetryNotice } from "./HarnessCatalogRetryNotice";

export function AgentHarnessField({
  catalogStatus,
  disabled,
  hint,
  onValueChange,
  options,
  placeholder,
  value,
  warning,
}: {
  catalogStatus?: "loading" | "ready" | "error";
  disabled: boolean;
  /** Observe/Drive (or other) capability note for the selected harness. */
  hint?: ReactNode;
  onValueChange: (value: string) => void;
  options: PersonaDropdownOption[];
  placeholder: string;
  value: string;
  warning?: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label
        className="text-sm font-medium text-foreground"
        htmlFor="persona-runtime"
      >
        Agent harness
      </label>
      <PersonaDropdownField
        disabled={disabled}
        id="persona-runtime"
        onValueChange={onValueChange}
        options={options}
        placeholder={placeholder}
        value={value}
      />
      {hint ? (
        <p
          className="text-xs text-muted-foreground"
          data-testid="agent-harness-browser-tools-hint"
        >
          {hint}
        </p>
      ) : null}
      {catalogStatus === "error" ? <HarnessCatalogRetryNotice /> : warning}
    </div>
  );
}
