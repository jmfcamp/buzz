import {
  KIND_PROJECT_ANNOUNCEMENT,
  KIND_REPO_ANNOUNCEMENT,
} from "@/shared/constants/kinds";
import { buildProjectAnnouncementTemplate } from "@/features/projects/projectCreation";
import type { ProjectEventTemplate } from "@/features/projects/projectCreation";
import type { ProjectListingVisibility } from "@/features/projects/projectCreation";
import {
  MAX_HULA_PATH_BYTES,
  PROJECT_HULA_PATH_TAG,
  PROJECT_RELATED_CHANNEL_TAG,
  validateProjectEventEnvelope,
} from "@/features/projects/projectModels";
import type { PlannedHulaRepo } from "@/features/projects/lib/hulaProjectPlan";

export type HulaRepositoryRecord = {
  dtag: string;
  address: string;
  event: ProjectEventTemplate;
};

export type HulaProjectRecords = {
  project: ProjectEventTemplate;
  repositories: HulaRepositoryRecord[];
};

/**
 * One path record per repo. The root record uses the home channel.
 * Nested repos use their own channels. No relay clone URL is written.
 */
export function buildHulaProjectRecords(input: {
  description?: string;
  homeChannelId: string;
  name: string;
  ownerPubkey: string;
  projectVisibility?: ProjectListingVisibility;
  repos: readonly (PlannedHulaRepo & { channelId: string })[];
}): HulaProjectRecords {
  const owner = input.ownerPubkey.trim().toLowerCase();
  const repositories = input.repos.map((repo) => {
    assertHulaPath(repo.hulaPath);
    const address = `${KIND_REPO_ANNOUNCEMENT}:${owner}:${repo.dtag}`;
    const repoName = repo.subPath || input.name.trim();
    const tags: string[][] = [
      ["d", repo.dtag],
      ["name", repoName],
      ["buzz-channel", repo.channelId],
      [PROJECT_HULA_PATH_TAG, repo.hulaPath],
    ];
    return {
      dtag: repo.dtag,
      address,
      event: {
        kind: KIND_REPO_ANNOUNCEMENT,
        content: "",
        tags,
      },
    };
  });

  const root = input.repos.find((repo) => repo.subPath === "");
  if (!root || root.channelId !== input.homeChannelId) {
    throw new Error("The project root must use the home channel.");
  }

  const announcement = buildProjectAnnouncementTemplate({
    description: input.description,
    name: input.name,
    ownerPubkey: owner,
    projectChannelId: input.homeChannelId,
    projectVisibility: input.projectVisibility ?? "listed",
    repositoryAddresses: repositories.map((repo) => repo.address),
  });
  const rootRecord = repositories.find((repo) => repo.dtag === root.dtag);
  if (!rootRecord) {
    throw new Error("The project root record is missing.");
  }
  announcement.project.tags.push([PROJECT_HULA_PATH_TAG, root.hulaPath]);
  const relatedIds = [
    ...new Set(
      input.repos
        .filter((repo) => repo.channelId !== input.homeChannelId)
        .map((repo) => repo.channelId),
    ),
  ].sort();
  for (const channelId of relatedIds) {
    announcement.project.tags.push([PROJECT_RELATED_CHANNEL_TAG, channelId]);
  }
  validateProjectEventEnvelope(
    announcement.project.tags,
    announcement.project.content,
  );
  if (announcement.project.kind !== KIND_PROJECT_ANNOUNCEMENT) {
    throw new Error("Project record kind is invalid.");
  }
  return { project: announcement.project, repositories };
}

function assertHulaPath(hulaPath: string) {
  if (new TextEncoder().encode(hulaPath).byteLength > MAX_HULA_PATH_BYTES) {
    throw new Error("The Hula path is too long.");
  }
}
