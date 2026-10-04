import { HULA_RESERVED_COMMUNITY_BOT_PUBKEYS } from "@/features/agents/lib/reservedCommunityMentionRouting";
import type { CommunityBot } from "@/features/community-bots/lib/types";
import {
  resolveUserLabel,
  type UserProfileLookup,
} from "@/features/profile/lib/identity";
import {
  communityBotPubkeySet,
  driNip05IsBot,
} from "@/features/projects/lib/projectDri";
import type { ProjectRepoCommit } from "@/shared/api/projectGitTypes";
import { normalizePubkey } from "@/shared/lib/pubkey";

/** Member dropdown default. Shows every loaded event. */
export const ACTIVITY_MEMBER_EVERYONE = "everyone";

export type ActivitySort = "newest" | "oldest";

/** Newest lists later events first. Oldest lists earlier events first. Neither adds events. */
export const ACTIVITY_SORT_OPTIONS: readonly {
  label: string;
  value: ActivitySort;
}[] = [
  { label: "Newest", value: "newest" },
  { label: "Oldest", value: "oldest" },
];

/**
 * Who-dropdown subsections, in display order. Everyone stays above these
 * groups. Empty groups are omitted by the select.
 */
export const ACTIVITY_MEMBER_SECTIONS = [
  { id: "members", label: "Members" },
  { id: "community-bots", label: "Community bots" },
  { id: "local-agents", label: "Local agents" },
  { id: "archived", label: "Archived" },
] as const;

export type ActivityMemberSectionId =
  (typeof ACTIVITY_MEMBER_SECTIONS)[number]["id"];

const ACTIVITY_MEMBER_SECTION_RANK = new Map(
  ACTIVITY_MEMBER_SECTIONS.map((section, index) => [section.id, index]),
);

export type ActivityMemberOption = {
  id: string;
  label: string;
  /** Lowercased git author names that belong to this person when an event has no pubkey. */
  names: string[];
  pubkey: string | null;
  /** Absent only for an id restored before its row is loaded. */
  section?: ActivityMemberSectionId;
};

type ActivityAuthorIssue = {
  issue: {
    author: string;
    comments: readonly { author: string }[];
  };
};

type ActivityAuthorPullRequest = {
  pullRequest: {
    author: string;
    comments: readonly { author: string }[];
    updates: readonly { author: string }[];
  };
};

type ActivityAuthorChatMessage = {
  pubkey: string;
};

/** Newest commit in a snapshot, matching the single commit row the feed emits. */
export function latestActivityCommit<T extends { timestamp: number }>(
  commits: readonly T[] | null | undefined,
): T | null {
  if (!commits || commits.length === 0) return null;
  return commits.reduce((latest, candidate) =>
    candidate.timestamp > latest.timestamp ? candidate : latest,
  );
}

function addPubkey(pubkeys: Set<string>, value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return;
  pubkeys.add(normalizePubkey(trimmed));
}

/**
 * Authors of events the activity feed actually builds. Assignees and
 * reviewers are left out: being named on an item is not an event.
 */
export function activityAuthorPubkeys(input: {
  chatMessages?: readonly ActivityAuthorChatMessage[];
  issues: readonly ActivityAuthorIssue[];
  projects: readonly { owner: string }[];
  pullRequests: readonly ActivityAuthorPullRequest[];
}): string[] {
  const pubkeys = new Set<string>();
  for (const project of input.projects) addPubkey(pubkeys, project.owner);
  for (const { issue } of input.issues) {
    addPubkey(pubkeys, issue.author);
    for (const comment of issue.comments) addPubkey(pubkeys, comment.author);
  }
  for (const { pullRequest } of input.pullRequests) {
    addPubkey(pubkeys, pullRequest.author);
    for (const comment of pullRequest.comments) {
      addPubkey(pubkeys, comment.author);
    }
    for (const update of pullRequest.updates) addPubkey(pubkeys, update.author);
  }
  for (const message of input.chatMessages ?? []) {
    addPubkey(pubkeys, message.pubkey);
  }
  return [...pubkeys];
}

/** Git names on the latest commit row of each loaded snapshot. */
export function activityCommitAuthorNames(
  snapshots:
    | Record<string, { commits: readonly ProjectRepoCommit[] }>
    | undefined,
): string[] {
  if (!snapshots) return [];
  const names = new Map<string, string>();
  for (const snapshot of Object.values(snapshots)) {
    const name = latestActivityCommit(snapshot.commits)?.authorName.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (!names.has(key)) names.set(key, name);
  }
  return [...names.values()];
}

type KnownPerson = {
  fallbackName: string | null;
  pubkey: string;
};

function rememberPerson(
  people: Map<string, KnownPerson>,
  pubkey: string | null | undefined,
  fallbackName?: string | null,
) {
  const trimmed = pubkey?.trim();
  if (!trimmed) return;
  const normalized = normalizePubkey(trimmed);
  const existing = people.get(normalized);
  const name = fallbackName?.trim() || null;
  if (!existing) {
    people.set(normalized, { fallbackName: name, pubkey: normalized });
    return;
  }
  if (!existing.fallbackName && name) existing.fallbackName = name;
}

type ActivityManagedAgent = {
  backend?: { type: string } | null;
  name?: string | null;
  ownerPubkey?: string | null;
  pubkey: string;
  status?: string | null;
};

type ActivityRelayAgent = {
  name?: string | null;
  ownerPubkey?: string | null;
  pubkey: string;
};

function isLocalManagedAgent(agent: ActivityManagedAgent) {
  const type = agent.backend?.type?.trim().toLowerCase();
  return !type || type === "local";
}

/** Running or deployed. Anything else on a local agent is offline. */
function isActiveManagedAgent(agent: ActivityManagedAgent) {
  const status = agent.status?.trim().toLowerCase();
  return status === "running" || status === "deployed";
}

/**
 * Display name already known for this owner. A bare pubkey is not a name, so
 * callers omit the parentheses instead of inventing one.
 */
function knownOwnerName(
  ownerPubkey: string | null | undefined,
  profiles: UserProfileLookup | undefined,
) {
  const normalized = ownerPubkey?.trim() ? normalizePubkey(ownerPubkey) : "";
  if (!normalized) return null;
  const profile = profiles?.[normalized];
  const name =
    profile?.displayName?.trim() ||
    profile?.name?.trim() ||
    profile?.nip05Handle?.trim() ||
    "";
  return name || null;
}

function sectionRank(section: ActivityMemberSectionId | undefined) {
  if (!section) return ACTIVITY_MEMBER_SECTIONS.length;
  return (
    ACTIVITY_MEMBER_SECTION_RANK.get(section) ?? ACTIVITY_MEMBER_SECTIONS.length
  );
}

const HEX_PUBKEY = /^[0-9a-f]{64}$/;

function hexPubkey(value: string | null | undefined) {
  const pubkey = value?.trim() ? normalizePubkey(value) : "";
  return HEX_PUBKEY.test(pubkey) ? pubkey : "";
}

/**
 * Community bots stay out of Members. The catalog matches both pubkey and id.
 * Mo, Captain, Korg, Quasar, and Stitch stay bots even when kind-0 looks
 * human and the catalog was not loaded. A `bot@` nip05 is the same signal
 * the DRI menu uses.
 */
function activityCommunityBotPubkeys(
  bots: readonly { id?: string | null; pubkey?: string | null }[] | null | undefined,
) {
  const pubkeys = communityBotPubkeySet(bots ?? []);
  for (const pubkey of Object.values(HULA_RESERVED_COMMUNITY_BOT_PUBKEYS)) {
    pubkeys.add(normalizePubkey(pubkey));
  }
  return pubkeys;
}

/**
 * Dropdown rows: authors already on the loaded activity, plus relay members,
 * community bots, and local agents only when those lists were already loaded.
 * Passing null for a roster means it is not loaded and must not be fetched
 * from here.
 *
 * `scopedPubkeys`, when set, is the only set listed. The project or channel
 * filter passes authors of the events that remain, plus members of the
 * channels related to that project. Rosters still classify those people.
 * They do not add the rest of the relay. Omit it for the All filter.
 *
 * Rows are grouped into Members (humans only), Community bots, active Local
 * agents, then Archived (local agents that are offline). A local agent's
 * label is its name plus the managing member who created it, when that
 * owner's name is already known.
 */
export function activityMemberOptions(input: {
  authorNames: readonly string[];
  authorPubkeys: readonly string[];
  bots?: readonly CommunityBot[] | null;
  managedAgents?: readonly ActivityManagedAgent[] | null;
  members?: readonly { pubkey: string }[] | null;
  profiles?: UserProfileLookup;
  relayAgents?: readonly ActivityRelayAgent[] | null;
  scopedPubkeys?: ReadonlySet<string> | null;
}): ActivityMemberOption[] {
  const people = new Map<string, KnownPerson>();
  const managedByPubkey = new Map<string, ActivityManagedAgent>();
  const relayByPubkey = new Map<string, ActivityRelayAgent>();
  const botPubkeys = activityCommunityBotPubkeys(input.bots);
  const scoped = input.scopedPubkeys
    ? new Set([...input.scopedPubkeys].map((pubkey) => normalizePubkey(pubkey)))
    : null;
  const listed = (pubkey: string | null | undefined) => {
    if (!scoped) return true;
    const normalized = hexPubkey(pubkey);
    return normalized.length > 0 && scoped.has(normalized);
  };

  for (const pubkey of input.authorPubkeys) {
    if (listed(pubkey)) rememberPerson(people, pubkey);
  }
  if (scoped) {
    for (const pubkey of scoped) {
      if (!hexPubkey(pubkey)) continue;
      rememberPerson(people, pubkey);
    }
  }
  if (input.members) {
    for (const member of input.members) {
      if (!listed(member.pubkey)) continue;
      rememberPerson(people, member.pubkey);
    }
  }
  if (input.bots) {
    for (const bot of input.bots) {
      const pubkey = hexPubkey(bot.pubkey);
      const id = hexPubkey(bot.id);
      if (pubkey && listed(pubkey)) rememberPerson(people, pubkey, bot.name);
      if (id && id !== pubkey && listed(id)) rememberPerson(people, id, bot.name);
    }
  }
  if (input.managedAgents) {
    for (const agent of input.managedAgents) {
      const pubkey = hexPubkey(agent.pubkey);
      if (!pubkey || managedByPubkey.has(pubkey)) continue;
      managedByPubkey.set(pubkey, agent);
      if (listed(pubkey)) rememberPerson(people, pubkey, agent.name);
    }
  }
  if (input.relayAgents) {
    for (const agent of input.relayAgents) {
      const pubkey = hexPubkey(agent.pubkey);
      if (!pubkey || relayByPubkey.has(pubkey)) continue;
      relayByPubkey.set(pubkey, agent);
    }
  }

  const sectionFor = (pubkey: string): ActivityMemberSectionId | null => {
    const managed = managedByPubkey.get(pubkey);
    if (managed && isLocalManagedAgent(managed)) {
      return isActiveManagedAgent(managed) ? "local-agents" : "archived";
    }
    if (
      botPubkeys.has(pubkey) ||
      driNip05IsBot(input.profiles?.[pubkey]?.nip05Handle)
    ) {
      return "community-bots";
    }
    if (
      managedByPubkey.has(pubkey) ||
      relayByPubkey.has(pubkey) ||
      input.profiles?.[pubkey]?.isAgent === true
    ) {
      return null;
    }
    return "members";
  };

  const communityBots = input.bots ?? undefined;
  const pubkeyOptions: ActivityMemberOption[] = [];
  const matchKeyByOption = new Map<ActivityMemberOption, string>();
  for (const person of people.values()) {
    const section = sectionFor(person.pubkey);
    if (!section) continue;
    const resolved = resolveUserLabel({
      communityBots,
      fallbackName: person.fallbackName,
      preferResolvedSelfLabel: true,
      profiles: input.profiles,
      pubkey: person.pubkey,
    });
    const managed = managedByPubkey.get(person.pubkey);
    const isLocalSection = section === "local-agents" || section === "archived";
    const bare = isLocalSection ? managed?.name?.trim() || resolved : resolved;
    const ownerName = isLocalSection
      ? knownOwnerName(
          managed?.ownerPubkey?.trim() ||
            input.profiles?.[person.pubkey]?.ownerPubkey ||
            relayByPubkey.get(person.pubkey)?.ownerPubkey,
          input.profiles,
        )
      : null;
    const label = ownerName ? `${bare} (${ownerName})` : bare;
    const matchKey = bare.trim().toLowerCase();
    const option: ActivityMemberOption = {
      id: `pubkey:${person.pubkey}`,
      label,
      names: [],
      pubkey: person.pubkey,
      section,
    };
    pubkeyOptions.push(option);
    if (matchKey) matchKeyByOption.set(option, matchKey);
  }

  const byLabel = new Map<string, ActivityMemberOption[]>();
  for (const option of pubkeyOptions) {
    const key = matchKeyByOption.get(option);
    if (!key) continue;
    const matches = byLabel.get(key) ?? [];
    matches.push(option);
    byLabel.set(key, matches);
  }

  const nameOptions: ActivityMemberOption[] = [];
  for (const rawName of input.authorNames) {
    const name = rawName.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const matches = byLabel.get(key) ?? [];
    if (matches.length === 1) {
      if (!matches[0].names.includes(key)) matches[0].names.push(key);
      continue;
    }
    nameOptions.push({
      id: `name:${key}`,
      label: name,
      names: [key],
      pubkey: null,
      section: "members",
    });
  }

  return [...pubkeyOptions, ...nameOptions].sort((left, right) => {
    const bySection = sectionRank(left.section) - sectionRank(right.section);
    if (bySection !== 0) return bySection;
    return left.label.localeCompare(right.label, undefined, {
      sensitivity: "base",
    });
  });
}

export function activityMemberFromId(
  memberId: string,
): ActivityMemberOption | null {
  if (memberId === ACTIVITY_MEMBER_EVERYONE) return null;
  if (memberId.startsWith("pubkey:")) {
    const pubkey = normalizePubkey(memberId.slice("pubkey:".length));
    if (!pubkey) return null;
    return { id: memberId, label: "", names: [], pubkey };
  }
  if (memberId.startsWith("name:")) {
    const name = memberId.slice("name:".length).trim().toLowerCase();
    if (!name) return null;
    return { id: memberId, label: name, names: [name], pubkey: null };
  }
  return null;
}

export function activityEventMatchesMember(
  event: { actorName: string | null; actorPubkey: string | null },
  member: ActivityMemberOption | null,
): boolean {
  if (!member) return true;
  if (
    member.pubkey &&
    event.actorPubkey &&
    normalizePubkey(event.actorPubkey) === member.pubkey
  ) {
    return true;
  }
  // Signed events stay with their pubkey. Git names attach only when the
  // event has no key, and only to a label that matched exactly one person.
  if (event.actorPubkey) return false;
  const name = event.actorName?.trim().toLowerCase() ?? "";
  return name.length > 0 && member.names.includes(name);
}

export function compareActivityCreatedAt(
  sort: ActivitySort,
  left: { createdAt: number },
  right: { createdAt: number },
) {
  return sort === "oldest"
    ? left.createdAt - right.createdAt
    : right.createdAt - left.createdAt;
}
