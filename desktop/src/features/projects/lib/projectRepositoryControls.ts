/**
 * Add-repository and access-channel controls publish relay repositories.
 * An OpenClaw project already has its repositories, so those controls stay hidden.
 */
export function showRelayRepositoryControls(input: {
  projectHulaPath?: string | null;
  repositoryHulaPath?: string | null;
}): boolean {
  return !input.projectHulaPath?.trim() && !input.repositoryHulaPath?.trim();
}
