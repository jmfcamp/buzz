const prompts = new Map<string, string>();

export function rememberTermSessionPrompt(sid: string, prompt: string) {
  if (!sid || typeof prompt !== "string") return;
  prompts.set(sid, prompt);
}

export function getTermSessionPrompt(sid: string): string | null {
  return prompts.get(sid) ?? null;
}

export function clearTermSessionPromptStoreForTests() {
  prompts.clear();
}
