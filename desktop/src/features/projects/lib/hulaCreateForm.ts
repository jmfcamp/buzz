export type HulaCreateAttachment = {
  error: string | null;
  hula?: {
    hulaPath: string;
    repoPaths: readonly string[];
  };
};

/**
 * Empty path keeps name-only create.
 * A typed path must already have been resolved.
 */
export function hulaCreateAttachment(
  path: string,
  resolved: { hulaPath: string; repoPaths: readonly string[] } | null,
): HulaCreateAttachment {
  const trimmed = path.trim();
  if (!trimmed) return { error: null };
  if (!resolved) {
    return { error: "Find the project before creating it." };
  }
  return {
    error: null,
    hula: {
      hulaPath: resolved.hulaPath,
      repoPaths: resolved.repoPaths,
    },
  };
}

/** Shown when Find cannot reach OpenClaw. Other failures keep their message. */
export function hulaFindErrorMessage(error: unknown): string {
  const message =
    error instanceof Error ? error.message : "Could not find that project.";
  if (/not connected|openclaw workspace grant|invoke/i.test(message)) {
    return "Connect OpenClaw, then find the project.";
  }
  return message;
}

/** Relay back-pressure is a wait, not a project-name failure. */
export function projectFormErrorMessage(error: unknown): string {
  const message =
    error instanceof Error ? error.message : "Failed to create project.";
  if (/rate-limited|quota exceeded/i.test(message)) {
    return "The relay is busy. Wait a moment, then create the project again.";
  }
  return message;
}
