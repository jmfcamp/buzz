import { MAX_PROJECT_MEMBERS } from "@/features/projects/projectModels";
import { projectDtagFromName } from "@/features/projects/projectCreation";
import {
  allocateDisplayName,
  repoChannelName,
} from "@/features/projects/lib/hulaProjectNames";

export type PlannedHulaRepo = {
  subPath: string;
  hulaPath: string;
  /** Empty for the project root, which uses the home channel. */
  channelName: string;
  dtag: string;
};

export type HulaChannelPlan = {
  homeChannelName: string;
  repos: PlannedHulaRepo[];
};

/** Channel names and distinct `d` tags for the root repo and each nested repo. */
export function planHulaChannels(input: {
  projectName: string;
  rootPath: string;
  repoPaths: readonly string[];
  takenChannelNames: readonly string[];
}): HulaChannelPlan {
  const projectName = input.projectName.trim();
  const rootPath = input.rootPath;
  const repoPaths = uniqueRepoPaths(rootPath, input.repoPaths);
  if (repoPaths.length > MAX_PROJECT_MEMBERS) {
    throw new Error(
      `A project can include at most ${MAX_PROJECT_MEMBERS} repositories.`,
    );
  }

  const homeChannelName = allocateDisplayName(
    projectName,
    input.takenChannelNames,
  );
  if (!homeChannelName) {
    throw new Error("The project channel name is too long.");
  }

  const taken = new Set(input.takenChannelNames);
  taken.add(homeChannelName);
  const usedDtags = new Set<string>();
  const rootDtag = takeDtag(projectDtagFromName(projectName), usedDtags);
  const repos: PlannedHulaRepo[] = [
    {
      subPath: "",
      hulaPath: rootPath,
      channelName: homeChannelName,
      dtag: rootDtag,
    },
  ];

  const nested = repoPaths
    .filter((path) => path !== rootPath)
    .map((path) => ({
      path,
      subPath: path.slice(rootPath.length + 1),
    }))
    .sort((left, right) => left.subPath.localeCompare(right.subPath));

  for (const repo of nested) {
    const bare = repoChannelName(projectName, repo.subPath);
    if (!bare) {
      throw new Error(
        `The channel name for ${repo.subPath} is too long to store.`,
      );
    }
    const channelName = allocateDisplayName(bare, [...taken]);
    if (!channelName) {
      throw new Error(
        `The channel name for ${repo.subPath} is too long to store.`,
      );
    }
    taken.add(channelName);
    repos.push({
      subPath: repo.subPath,
      hulaPath: repo.path,
      channelName,
      dtag: takeDtag(projectDtagFromName(channelName), usedDtags),
    });
  }

  return { homeChannelName, repos };
}

function uniqueRepoPaths(
  rootPath: string,
  repoPaths: readonly string[],
): string[] {
  const paths = new Set<string>([rootPath]);
  for (const path of repoPaths) {
    if (path !== rootPath && !path.startsWith(`${rootPath}/`)) {
      throw new Error("A repository path must stay inside the project.");
    }
    paths.add(path);
  }
  return [...paths];
}

export function allocateRepositoryDtag(
  base: string,
  usedNames: readonly string[],
): string {
  const used = new Set(usedNames);
  return takeDtag(base, used);
}

function takeDtag(base: string, used: Set<string>): string {
  const stem = base || "repo";
  if (!used.has(stem)) {
    used.add(stem);
    return stem;
  }
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${stem}-${n}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
  throw new Error("Could not assign a unique repository id.");
}
