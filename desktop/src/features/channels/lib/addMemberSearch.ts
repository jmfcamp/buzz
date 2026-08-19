import type { ManagedAgent, UserSearchResult } from "@/shared/api/types";
import { normalizePubkey, truncatePubkey } from "@/shared/lib/pubkey";

export function formatAddCandidateName(user: UserSearchResult) {
  return (
    user.displayName?.trim() ||
    user.nip05Handle?.trim() ||
    truncatePubkey(user.pubkey)
  );
}

export type AddMemberSearchCandidate = UserSearchResult & {
  isManagedAgent?: boolean;
  isMember?: boolean;
  personaId?: string | null;
};

export function addMemberCandidatePersonaId(
  candidate: UserSearchResult,
  managedAgentsByPubkey: ReadonlyMap<string, ManagedAgent>,
) {
  return managedAgentsByPubkey.get(normalizePubkey(candidate.pubkey))
    ?.personaId;
}

export function addMemberCandidateIsManagedAgent(
  candidate: UserSearchResult,
  managedAgentsByPubkey: ReadonlyMap<string, ManagedAgent>,
) {
  return managedAgentsByPubkey.has(normalizePubkey(candidate.pubkey));
}

export function addMemberCandidateWithAgentMetadata(
  candidate: UserSearchResult,
  managedAgentsByPubkey: ReadonlyMap<string, ManagedAgent>,
): AddMemberSearchCandidate {
  return {
    ...candidate,
    isManagedAgent: addMemberCandidateIsManagedAgent(
      candidate,
      managedAgentsByPubkey,
    ),
    personaId: addMemberCandidatePersonaId(candidate, managedAgentsByPubkey),
  };
}
