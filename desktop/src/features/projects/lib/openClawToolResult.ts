/** Text parts of an MCP `tools/call` result. */
export function openClawToolText(result: unknown): string {
  if (!result || typeof result !== "object") return "";
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (!part || typeof part !== "object" || !("text" in part)) return "";
      const text = (part as { text?: unknown }).text;
      return typeof text === "string" ? text : "";
    })
    .filter((text) => text.length > 0)
    .join("\n");
}

/** JSON object tools return inside the text part. Non-JSON text stays wrapped. */
export function openClawToolJson(result: unknown): unknown {
  const text = openClawToolText(result);
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { text };
  }
}

export function openClawMissingPath(result: unknown): boolean {
  const text = openClawToolText(result);
  return /ENOENT|no such file|not found/i.test(text);
}
