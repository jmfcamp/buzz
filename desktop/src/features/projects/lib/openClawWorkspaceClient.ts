import { invokeTauri } from "@/shared/api/tauri";
import type {
  WorkspaceClient,
  WorkspaceEntry,
  WorkspaceStat,
} from "@/features/projects/lib/hulaProjectResolve";
import {
  openClawMissingPath,
  openClawToolJson,
  openClawToolText,
} from "@/features/projects/lib/openClawToolResult";

export type OpenClawWorkspaceToolName =
  | "list_directory"
  | "stat_path"
  | "read_file"
  | "exec";

export type OpenClawToolResult = {
  isError: boolean;
  result: unknown;
};

export async function callOpenClawWorkspaceTool(
  name: OpenClawWorkspaceToolName,
  arguments_: Record<string, unknown>,
): Promise<OpenClawToolResult> {
  return invokeTauri<OpenClawToolResult>("call_openclaw_workspace_mcp_tool", {
    name,
    arguments: arguments_,
  });
}

type ToolCall = typeof callOpenClawWorkspaceTool;

const WALK_DEPTH = 8;

export function createOpenClawWorkspaceClient(
  call: ToolCall,
): WorkspaceClient & {
  readFile(path: string): Promise<string | null>;
  exec(
    argv: string[],
    cwd: string,
  ): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number | null;
    truncated?: boolean;
  }>;
} {
  return {
    async statPath(path: string): Promise<WorkspaceStat | null> {
      const response = await call("stat_path", { path });
      if (response.isError) {
        if (openClawMissingPath(response.result)) return null;
        throw new Error(
          openClawToolText(response.result) || "Could not stat that path.",
        );
      }
      const json = openClawToolJson(response.result);
      const type =
        json && typeof json === "object" && "type" in json
          ? (json as { type?: unknown }).type
          : null;
      if (
        type === "file" ||
        type === "directory" ||
        type === "symlink" ||
        type === "other"
      ) {
        return { type };
      }
      return null;
    },
    async listDirectory(path: string): Promise<WorkspaceEntry[]> {
      const response = await call("list_directory", {
        path,
        depth: WALK_DEPTH,
        namesOnly: true,
      });
      if (response.isError) {
        throw new Error(
          openClawToolText(response.result) || "Could not list that directory.",
        );
      }
      const json = openClawToolJson(response.result);
      const entries =
        json && typeof json === "object" && "entries" in json
          ? (json as { entries?: unknown }).entries
          : null;
      return Array.isArray(entries) ? (entries as WorkspaceEntry[]) : [];
    },
    async readFile(path: string): Promise<string | null> {
      const response = await call("read_file", { path });
      if (response.isError) {
        if (openClawMissingPath(response.result)) return null;
        throw new Error(
          openClawToolText(response.result) || "Could not read that file.",
        );
      }
      const json = openClawToolJson(response.result);
      const content =
        json && typeof json === "object" && "content" in json
          ? (json as { content?: unknown }).content
          : null;
      return typeof content === "string" ? content : null;
    },
    async exec(argv: string[], cwd: string) {
      const response = await call("exec", { argv, cwd });
      if (response.isError) {
        throw new Error(openClawToolText(response.result) || "Command failed.");
      }
      const json = openClawToolJson(response.result);
      const record =
        json && typeof json === "object"
          ? (json as {
              stdout?: unknown;
              stderr?: unknown;
              exitCode?: unknown;
              truncated?: unknown;
            })
          : {};
      return {
        stdout: typeof record.stdout === "string" ? record.stdout : "",
        stderr: typeof record.stderr === "string" ? record.stderr : "",
        exitCode: typeof record.exitCode === "number" ? record.exitCode : null,
        truncated: record.truncated === true,
      };
    },
  };
}

export const openClawWorkspaceClient = createOpenClawWorkspaceClient(
  callOpenClawWorkspaceTool,
);
