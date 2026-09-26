import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildChannelAgentSessionCandidates } from "./useChannelAgentSessions.ts";
import { useActiveAgentPubkeys } from "../../messages/lib/useActiveAgentPubkeys.ts";

const relayAgents = ["unknown", "online", "away", "offline"].map((status) => ({
  pubkey: status,
  name: status,
  status,
  channelIds: [],
  channels: [],
}));

test("session projection retains unknown rather than manufacturing deployed status", () => {
  const candidates = buildChannelAgentSessionCandidates({
    managedAgents: [],
    relayAgents,
  });
  assert.deepEqual(
    candidates.map(({ status }) => status),
    ["unknown", "deployed", "deployed", "stopped"],
  );
});

test("active-agent lookup requires positive relay liveness evidence", () => {
  let active;
  function Probe() {
    active = useActiveAgentPubkeys([], relayAgents);
    return null;
  }
  renderToStaticMarkup(React.createElement(Probe));
  assert.deepEqual([...active], ["online", "away"]);
});

test("community bots on the roster join session candidates as member-bots", () => {
  const botPubkey = "aa".repeat(32);
  const candidates = buildChannelAgentSessionCandidates({
    channelMembers: [
      {
        pubkey: botPubkey,
        role: "member",
        isAgent: false,
        displayName: "Mo Desk",
      },
    ],
    communityBots: [{ name: "Mo Desk", pubkey: botPubkey }],
    managedAgents: [],
    relayAgents: [],
  });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.agentSource, "member-bot");
  assert.equal(candidates[0]?.name, "Mo Desk");
  assert.equal(candidates[0]?.status, "deployed");
});

test("typing-allow-listed community bots join even without roster rows", () => {
  const botPubkey = "bb".repeat(32);
  const candidates = buildChannelAgentSessionCandidates({
    channelMembers: [],
    communityBots: [{ name: "Korg", pubkey: botPubkey }],
    communityBotPubkeys: [botPubkey],
    managedAgents: [],
    relayAgents: [],
  });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.agentSource, "member-bot");
  assert.equal(candidates[0]?.name, "Korg");
});
