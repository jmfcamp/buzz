import { HULA_RESERVED_COMMUNITY_BOT_PUBKEYS } from "@/features/agents/lib/reservedCommunityMentionRouting";
import { RESERVED_COMMUNITY_AGENT_NAMES } from "@/features/agents/lib/reservedAgentNames";
import { PROJECT_CODING_AGENT_TAG } from "@/features/projects/projectModels";
import { normalizePubkey } from "@/shared/lib/pubkey";

const CODING_AGENT_PUBKEY = /^[0-9a-f]{64}$/;

/** A pubkey that can be stored on the `coding-agent` tag. */
export function requireProjectCodingAgent(
  value: string | null | undefined,
): string {
  const pubkey = normalizePubkey(value ?? "");
  if (!CODING_AGENT_PUBKEY.test(pubkey)) {
    throw new Error("Choose a local bot or community bot.");
  }
  return pubkey;
}

/** Replace whatever `coding-agent` tag is stored. Other tags, including `dri`, stay. */
export function replaceProjectCodingAgentTag(
  tags: readonly (readonly string[])[],
  pubkey: string,
): string[][] {
  const codingAgent = requireProjectCodingAgent(pubkey);
  const next = tags
    .filter((tag) => tag[0] !== PROJECT_CODING_AGENT_TAG)
    .map((tag) => [...tag]);
  next.push([PROJECT_CODING_AGENT_TAG, codingAgent]);
  return next;
}

export type CodingAgentChoiceSource = {
  avatarUrl?: string | null;
  backend?: { type?: string | null } | null;
  name?: string | null;
  pubkey: string;
};

export type CodingAgentChoice = {
  avatarUrl: string | null;
  kind: "community" | "local";
  name: string;
  pubkey: string;
};

/**
 * Local managed bots and community bots only. Human members are not in
 * either list. A pubkey that is both is kept once, as the local bot.
 * Provider-backed agents and archived keys are left out.
 * The Hula community bots (Captain, Mo, Stitch, Quasar, Korg) are included
 * even when the installed catalog is empty.
 */
export function codingAgentChoices(input: {
  communityBots: readonly { name?: string | null; pubkey: string }[];
  isArchived?: (pubkey: string) => boolean;
  localAgents: readonly CodingAgentChoiceSource[];
}): CodingAgentChoice[] {
  const isArchived = input.isArchived ?? (() => false);
  const choices: CodingAgentChoice[] = [];
  const seen = new Set<string>();
  const take = (
    pubkeyRaw: string,
    name: string | null | undefined,
    avatarUrl: string | null,
    kind: CodingAgentChoice["kind"],
  ) => {
    const pubkey = normalizePubkey(pubkeyRaw);
    if (!CODING_AGENT_PUBKEY.test(pubkey) || seen.has(pubkey)) return;
    if (isArchived(pubkey)) return;
    seen.add(pubkey);
    choices.push({
      avatarUrl,
      kind,
      name: name?.trim() ?? "",
      pubkey,
    });
  };
  for (const agent of input.localAgents) {
    if (agent.backend?.type !== "local") continue;
    take(agent.pubkey, agent.name, agent.avatarUrl ?? null, "local");
  }
  for (const bot of input.communityBots) {
    take(bot.pubkey, bot.name, null, "community");
  }
  // Catalog rows can be missing on this relay. The live Hula bots still belong
  // in the picker. A pubkey already taken from the catalog is kept once.
  for (const name of RESERVED_COMMUNITY_AGENT_NAMES) {
    take(
      HULA_RESERVED_COMMUNITY_BOT_PUBKEYS[name],
      name,
      null,
      "community",
    );
  }
  return choices;
}

/** Channel member fields needed to recognize the create-time coding agent. */
export type ProjectCodingAgentMember = {
  joinedAt?: string | null;
  pubkey: string;
  role: string;
};

/**
 * Managed-agent fields needed to recognize the create-time coding agent.
 * The create form adds that persona with role bot, a local backend, a
 * persona id, and no team id. Team deploys set `teamId` and are not it.
 */
export type ProjectCodingAgentRecord = {
  avatarUrl?: string | null;
  backend?: { type?: string | null } | null;
  createdAt?: string | null;
  name?: string | null;
  personaId?: string | null;
  pubkey: string;
  teamId?: string | null;
};

function joinedAtMillis(value: string | null | undefined): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY;
}

function isCreateTimeCodingAgent(agent: ProjectCodingAgentRecord): boolean {
  if (agent.backend?.type !== "local") return false;
  if (!agent.personaId?.trim()) return false;
  if (agent.teamId?.trim()) return false;
  return true;
}

/**
 * Fallback when the project announcement has no `coding-agent` tag.
 * A bot member that is a local managed persona and was not deployed as part
 * of a team. Nothing when that agent is absent. The earliest join wins when
 * more than one matches, then pubkey. A stored tag wins over this.
 */
export function selectProjectCodingAgent<T extends ProjectCodingAgentRecord>(
  members: readonly ProjectCodingAgentMember[] | null | undefined,
  agents: readonly T[] | null | undefined,
): T | null {
  if (!members || !agents || members.length === 0 || agents.length === 0) {
    return null;
  }
  const joinedAtByPubkey = new Map<string, number>();
  for (const member of members) {
    if (member.role !== "bot") continue;
    const pubkey = normalizePubkey(member.pubkey);
    if (!pubkey) continue;
    const joinedAt = joinedAtMillis(member.joinedAt);
    const previous = joinedAtByPubkey.get(pubkey);
    if (previous === undefined || joinedAt < previous) {
      joinedAtByPubkey.set(pubkey, joinedAt);
    }
  }
  if (joinedAtByPubkey.size === 0) return null;

  const matches = agents.filter((agent) => {
    if (!isCreateTimeCodingAgent(agent)) return false;
    return joinedAtByPubkey.has(normalizePubkey(agent.pubkey));
  });
  if (matches.length === 0) return null;
  matches.sort((left, right) => {
    const leftPubkey = normalizePubkey(left.pubkey);
    const rightPubkey = normalizePubkey(right.pubkey);
    const byJoin =
      (joinedAtByPubkey.get(leftPubkey) ?? Number.POSITIVE_INFINITY) -
      (joinedAtByPubkey.get(rightPubkey) ?? Number.POSITIVE_INFINITY);
    if (byJoin !== 0) return byJoin;
    return leftPubkey.localeCompare(rightPubkey);
  });
  return matches[0] ?? null;
}
