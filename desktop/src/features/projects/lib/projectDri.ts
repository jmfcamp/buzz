import { HULA_RESERVED_COMMUNITY_BOT_PUBKEYS } from "@/features/agents/lib/reservedCommunityMentionRouting";
import {
  PROJECT_DRI_TAG,
  readProjectDri,
} from "@/features/projects/projectModels";
import { normalizePubkey } from "@/shared/lib/pubkey";

export type ProjectDriProfile = {
  avatarUrl?: string | null;
  displayName?: string | null;
  isAgent?: boolean;
  /** Profile or member kind. `"bot"` / `"agent"` are not people. */
  kind?: string | number | null;
  nip05Handle?: string | null;
  ownerPubkey?: string | null;
};

export type ProjectDriMember = {
  pubkey: string;
  isAgent?: boolean;
  kind?: string | number | null;
  nip05?: string | null;
  nip05Handle?: string | null;
  role?: string | null;
};

const HEX_PUBKEY = /^[0-9a-f]{64}$/;

/**
 * Mo, Captain, Korg, Quasar, and Stitch on wss://buzz.huladesk.com.
 * Their kind-0 profiles have no NIP-OA owner, so `isAgent` is false and a
 * catalog miss would leave them in the DRI menu. Always exclude these keys.
 */
const RESERVED_HULA_COMMUNITY_BOT_PUBKEYS = new Set(
  Object.values(HULA_RESERVED_COMMUNITY_BOT_PUBKEYS).map((pubkey) =>
    normalizePubkey(pubkey),
  ),
);

/** Kind values that mean this identity is a bot, not a DRI. */
export function driKindIsBot(kind: string | number | null | undefined): boolean {
  if (typeof kind === "number") return false;
  if (typeof kind !== "string") return false;
  const normalized = kind.trim().toLowerCase();
  return (
    normalized === "bot" ||
    normalized === "agent" ||
    normalized === "community-bot" ||
    normalized === "community_bot"
  );
}

/**
 * NIP-05 local-parts used by bots (`bot@…`, `name.bot@…`, `bot.name@…`).
 * A normal handle such as `jm@…` is not a bot.
 */
export function driNip05IsBot(nip05: string | null | undefined): boolean {
  const handle = nip05?.trim().toLowerCase() ?? "";
  if (!handle || !handle.includes("@")) return false;
  const local = handle.split("@", 1)[0] ?? "";
  if (!local) return false;
  return local === "bot" || local.endsWith(".bot") || local.startsWith("bot.");
}

function hexPubkey(value: string | null | undefined): string | null {
  if (!value) return null;
  const pubkey = normalizePubkey(value);
  return HEX_PUBKEY.test(pubkey) ? pubkey : null;
}

/**
 * Every hex pubkey on a community-bot record. Both `pubkey` and `id` are
 * kept: a catalog merge that prefers one id's pubkey must not hide the
 * member key stored on the other copy.
 */
export function communityBotPubkeySet(
  bots: readonly { id?: string | null; pubkey?: string | null }[],
): Set<string> {
  const pubkeys = new Set<string>();
  for (const bot of bots) {
    const pubkey = hexPubkey(bot.pubkey);
    const id = hexPubkey(bot.id);
    if (pubkey) pubkeys.add(pubkey);
    if (id) pubkeys.add(id);
  }
  return pubkeys;
}

function normalizedPubkeySet(values: ReadonlySet<string> | undefined): Set<string> {
  const pubkeys = new Set<string>();
  if (!values) return pubkeys;
  for (const value of values) {
    const pubkey = hexPubkey(value);
    if (pubkey) pubkeys.add(pubkey);
  }
  return pubkeys;
}

/** A pubkey that can be stored on the `dri` tag. */
export function isValidProjectDri(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^[0-9a-f]{64}$/.test(normalizePubkey(value));
}

/** Require the lowercase pubkey chosen in the create form. */
export function requireProjectDri(value: string | null | undefined): string {
  const pubkey = normalizePubkey(value ?? "");
  if (!/^[0-9a-f]{64}$/.test(pubkey)) {
    throw new Error("Choose a community member as DRI.");
  }
  return pubkey;
}

/**
 * Copy tags and set `dri` when the announcement does not already have a
 * valid one. An existing valid DRI is left alone.
 */
export function withProjectDriTag(
  tags: readonly (readonly string[])[],
  pubkey: string,
): string[][] {
  const dri = requireProjectDri(pubkey);
  if (readProjectDri(tags)) {
    return tags.map((tag) => [...tag]);
  }
  return replaceProjectDriTag(tags, dri);
}

/** Replace whatever `dri` tag is stored with the chosen community member. */
export function replaceProjectDriTag(
  tags: readonly (readonly string[])[],
  pubkey: string,
): string[][] {
  const dri = requireProjectDri(pubkey);
  const next = tags
    .filter((tag) => tag[0] !== PROJECT_DRI_TAG)
    .map((tag) => [...tag]);
  next.push([PROJECT_DRI_TAG, dri]);
  return next;
}

/**
 * Relay members who are people. Bots, local agents, and NIP-OA agent
 * profiles are excluded. A pubkey is excluded when its profile has not
 * settled, or when an exclusion source has not settled (`sourcesReady`
 * false), because an unknown key might still be an agent.
 * Mo, Captain, Korg, Quasar, and Stitch are excluded even when their
 * kind-0 profile looks human and the catalog set was not passed in.
 */
export function humanRelayDriCandidates(input: {
  /** Installed community bots. Matched by pubkey, separate from agents. */
  communityBotPubkeys?: ReadonlySet<string>;
  excludedPubkeys: ReadonlySet<string>;
  members: readonly ProjectDriMember[];
  profiles: Readonly<Record<string, ProjectDriProfile | undefined>>;
  sourcesReady: boolean;
}): { profile: ProjectDriProfile; pubkey: string }[] {
  if (!input.sourcesReady) return [];
  const excluded = normalizedPubkeySet(input.excludedPubkeys);
  for (const pubkey of normalizedPubkeySet(input.communityBotPubkeys)) {
    excluded.add(pubkey);
  }
  for (const pubkey of RESERVED_HULA_COMMUNITY_BOT_PUBKEYS) {
    excluded.add(pubkey);
  }
  const seen = new Set<string>();
  const candidates: { profile: ProjectDriProfile; pubkey: string }[] = [];
  for (const member of input.members) {
    const pubkey = normalizePubkey(member.pubkey);
    if (!HEX_PUBKEY.test(pubkey) || seen.has(pubkey)) continue;
    seen.add(pubkey);
    if (excluded.has(pubkey)) continue;
    if (member.isAgent === true || member.role === "bot") continue;
    if (driKindIsBot(member.kind)) continue;
    if (driNip05IsBot(member.nip05Handle ?? member.nip05)) continue;
    const profile =
      input.profiles[pubkey] ?? input.profiles[member.pubkey.trim()];
    if (!profile) continue;
    if (profile.isAgent === true) continue;
    if (profile.ownerPubkey?.trim()) continue;
    if (driKindIsBot(profile.kind)) continue;
    if (driNip05IsBot(profile.nip05Handle)) continue;
    candidates.push({ profile, pubkey });
  }
  return candidates;
}
