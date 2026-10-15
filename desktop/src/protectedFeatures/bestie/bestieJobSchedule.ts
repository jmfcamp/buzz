// Moved to the shared Assistant core so the web app can use it.
export * from "@/features/assistantData/core/bestieJobSchedule";

/** Format the outbound turn Bestie receives when a job fires. */
export function formatBestieJobRunPrompt(
  title: string,
  prompt: string,
): string {
  const cleanTitle = title.trim() || "Job";
  const cleanPrompt = prompt.trim();
  return `[Bestie job: ${cleanTitle}]\n\n${cleanPrompt}`;
}

export const BESTIE_JOB_RUN_MARKER = "[Bestie job:";
