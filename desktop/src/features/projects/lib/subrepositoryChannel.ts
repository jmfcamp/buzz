import { projectChannelPrimaryRepository } from "@/features/projects/lib/channelCodebase";
import type { Project, Repository } from "@/features/projects/projectModels";

export type SubrepositoryChannelBinding = {
  project: Project;
  repository: Repository;
};

/**
 * A subrepository channel is a repository `buzz-channel` that is not the
 * project home and not the primary repository. Ordinary channels, related
 * streams with no repository, and the home channel stay unmatched.
 * The oldest listed project wins, matching project-home selection.
 */
export function findSubrepositoryChannelBinding(
  channelId: string | null | undefined,
  projects: readonly Project[],
): SubrepositoryChannelBinding | null {
  const normalized = channelId?.trim() ?? "";
  if (!normalized) return null;

  const matches: SubrepositoryChannelBinding[] = [];
  for (const project of projects) {
    if (project.legacy) continue;
    if ((project.projectChannelId?.trim() ?? "") === normalized) continue;
    const primary = projectChannelPrimaryRepository(project);
    if (!primary) continue;
    for (const repository of project.repositories) {
      if ((repository.channelId?.trim() ?? "") !== normalized) continue;
      if (
        repository.id === primary.id ||
        repository.repoAddress === primary.repoAddress
      ) {
        continue;
      }
      matches.push({ project, repository });
    }
  }

  matches.sort(
    (left, right) => left.project.createdAt - right.project.createdAt,
  );
  return (
    matches.find((match) => match.project.visibility !== "unlisted") ??
    matches[0] ??
    null
  );
}
