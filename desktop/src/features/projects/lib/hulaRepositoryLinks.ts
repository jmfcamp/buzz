import { hulaDirectoryPath } from "@/features/projects/lib/hulaProjectNames";
import { KIND_REPO_ANNOUNCEMENT } from "@/shared/constants/kinds";
import type { RelayEvent } from "@/shared/api/types";

const PROJECT_HULA_PATH_TAG = "buzz-hula-path";

type LinkProject = {
  owner: string;
  repositoryAddresses: string[];
  repositories: { repoAddress: string; hulaPath?: string | null }[];
};

export type RepositoryLinkPlan = {
  /** Project membership after relinking, replacing and dropping. */
  addresses: string[];
  /** Folder paths already covered by a live repository. */
  known: Set<string>;
  relinked: string[];
  relinkedChannelIds: string[];
  replaced: Map<string, string>;
  dropped: Set<string>;
  /** Every live d-tag, so a new repo never reuses one. */
  allDtags: string[];
};

function addressParts(address: string): { pubkey: string; dtag: string } | null {
  const [kind, pubkey, ...rest] = address.split(":");
  if (kind !== String(KIND_REPO_ANNOUNCEMENT) || !pubkey) return null;
  return { pubkey: pubkey.toLowerCase(), dtag: rest.join(":") };
}

/**
 * Match workspace folders to live repository announcements from any author.
 * - A folder that already has a repo (even a collaborator's) is linked, not re-created.
 * - A membership link at the wrong author is moved to the live repo with that d-tag.
 * - A dead link that is an auto-numbered copy ("<dtag>-2") of a linked repo is dropped.
 * With no announcement list (tests, fetch failure) membership is left unchanged.
 */
export function planRepositoryLinks(
  project: LinkProject,
  root: string,
  discovered: readonly string[],
  announcements: readonly RelayEvent[] | null,
): RepositoryLinkPlan {
  const owner = project.owner.trim().toLowerCase();
  const known = new Set<string>([root]);
  const resolved = new Set<string>();
  for (const repository of project.repositories) {
    resolved.add(repository.repoAddress);
    if (!repository.hulaPath) continue;
    const normalized = hulaDirectoryPath(repository.hulaPath);
    if (normalized) known.add(normalized);
  }
  const plan: RepositoryLinkPlan = {
    addresses: [...project.repositoryAddresses],
    known,
    relinked: [],
    relinkedChannelIds: [],
    replaced: new Map(),
    dropped: new Set(),
    allDtags: [],
  };
  if (!announcements) return plan;

  type Live = { address: string; dtag: string; path: string | null; channelId: string | null; createdAt: number; pubkey: string };
  const live: Live[] = [];
  for (const event of announcements) {
    if (event.kind !== KIND_REPO_ANNOUNCEMENT) continue;
    const dtag = event.tags.find((tag) => tag[0] === "d")?.[1];
    if (!dtag) continue;
    const rawPath = event.tags.find((tag) => tag[0] === PROJECT_HULA_PATH_TAG)?.[1];
    live.push({
      address: `${KIND_REPO_ANNOUNCEMENT}:${event.pubkey.toLowerCase()}:${dtag}`,
      dtag,
      path: rawPath ? hulaDirectoryPath(rawPath) : null,
      channelId: event.tags.find((tag) => tag[0] === "buzz-channel")?.[1] ?? null,
      createdAt: event.created_at,
      pubkey: event.pubkey.toLowerCase(),
    });
  }
  plan.allDtags = live.map((repo) => repo.dtag);
  const liveAddresses = new Set(live.map((repo) => repo.address));
  const linked = new Set(project.repositoryAddresses);
  const rank = (repo: Live) =>
    [linked.has(repo.address) ? 0 : 1, repo.pubkey === owner ? 0 : 1, repo.createdAt] as const;
  const better = (a: Live, b: Live) => {
    const [x, y] = [rank(a), rank(b)];
    for (let i = 0; i < x.length; i += 1) if (x[i] !== y[i]) return x[i] < y[i];
    return a.address < b.address;
  };

  // 1. Links pointing at the wrong author: move to the live repo with that d-tag.
  const next: string[] = [];
  for (const address of plan.addresses) {
    if (resolved.has(address) || liveAddresses.has(address)) {
      next.push(address);
      continue;
    }
    const parts = addressParts(address);
    const candidates = parts ? live.filter((repo) => repo.dtag === parts.dtag) : [];
    const pick = candidates.reduce<Live | null>(
      (best, repo) => (best && !better(repo, best) ? best : repo),
      null,
    );
    if (pick) {
      plan.replaced.set(address, pick.address);
      next.push(pick.address);
      if (pick.path) known.add(pick.path);
      if (pick.channelId) plan.relinkedChannelIds.push(pick.channelId);
    } else {
      next.push(address);
    }
  }

  // 2. Folders with no linked repo: reuse a live repo for that folder, any author.
  for (const path of discovered) {
    if (known.has(path)) continue;
    const pick = live
      .filter((repo) => repo.path === path)
      .reduce<Live | null>((best, repo) => (best && !better(repo, best) ? best : repo), null);
    if (!pick) continue;
    known.add(path);
    plan.relinked.push(pick.address);
    plan.relinkedChannelIds.push(pick.channelId ?? "");
    next.push(pick.address);
  }
  plan.relinkedChannelIds = plan.relinkedChannelIds.filter(Boolean);

  // 3. Dead links that are numbered copies of a linked repo: drop them.
  const linkedDtags = new Set(
    next
      .filter((address) => liveAddresses.has(address) || resolved.has(address))
      .map((address) => addressParts(address)?.dtag ?? ""),
  );
  plan.addresses = [...new Set(next)].filter((address) => {
    if (liveAddresses.has(address) || resolved.has(address)) return true;
    const dtag = addressParts(address)?.dtag ?? "";
    const base = dtag.replace(/-\d+$/, "");
    if (base !== dtag && linkedDtags.has(base)) {
      plan.dropped.add(address);
      return false;
    }
    return true;
  });
  return plan;
}
