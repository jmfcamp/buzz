import type { AcpRuntimeCatalogEntry } from "@/shared/api/types";

import type { TermSessionTool } from "./types.ts";

export type TermSessionHarnessOption = {
  id: TermSessionTool;
  label: string;
  /** True when the underlying interactive CLI binary was discovered. */
  available: boolean;
  /** Path when known; otherwise null. */
  cliPath: string | null;
  installHint: string | null;
};

const HARNESS_META: Record<
  TermSessionTool,
  { label: string; catalogIds: readonly string[] }
> = {
  claude: { label: "Claude", catalogIds: ["claude"] },
  codex: { label: "Codex", catalogIds: ["codex"] },
};

/**
 * Prompt-capable interactive CLIs from the agent catalog (`underlying_cli`).
 * Shows Claude and Codex; marks unavailable when the binary path is missing.
 */
export function listTermSessionHarnesses(
  catalog: readonly AcpRuntimeCatalogEntry[],
): TermSessionHarnessOption[] {
  const byId = new Map(catalog.map((entry) => [entry.id, entry]));
  return (Object.keys(HARNESS_META) as TermSessionTool[]).map((id) => {
    const meta = HARNESS_META[id];
    const entry =
      meta.catalogIds.map((catalogId) => byId.get(catalogId)).find(Boolean) ??
      null;
    const cliPath = entry?.underlyingCliPath?.trim() || null;
    const available = Boolean(cliPath);
    return {
      id,
      label: meta.label,
      available,
      cliPath,
      installHint: available
        ? null
        : (entry?.installHint?.trim() ||
          `Install the ${meta.label} CLI to use this harness.`),
    };
  });
}
