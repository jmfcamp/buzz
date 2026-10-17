import test from "node:test";
import assert from "node:assert/strict";

const PK = "ab".repeat(32);
const OWNER = "cd".repeat(32);
const RELAY = "wss://relay.example";

test("directCmd: assign_bestie only picks one of your own agents for this owner + relay", async () => {
  const { handleCmd, CMD_WRITES } = await import("./directCmd.ts");
  assert.ok(CMD_WRITES.includes("assign_bestie"));
  assert.ok(CMD_WRITES.includes("clear_bestie_assignment"));
  const calls = [];
  const inv = async (name, args) => {
    calls.push([name, args]);
    if (name === "list_managed_agents") return [{ pubkey: PK, name: "Jeeves" }];
    if (name === "assign_bestie") return { agent_pubkey: args.agentPubkey };
    return null;
  };
  const deps = { invokeRaw: inv, ownerPubkey: OWNER };
  const r = await handleCmd(
    "assign_bestie",
    { agentPubkey: PK.toUpperCase(), expectedRelayUrl: RELAY, expectedSignerPubkey: OWNER },
    deps,
  );
  assert.deepEqual(r, { agent_pubkey: PK });
  assert.deepEqual(calls.at(-1), [
    "assign_bestie",
    { agentPubkey: PK, expectedRelayUrl: RELAY, expectedSignerPubkey: OWNER },
  ]);
  await assert.rejects(
    handleCmd("assign_bestie", { agentPubkey: "ef".repeat(32), expectedRelayUrl: RELAY, expectedSignerPubkey: OWNER }, deps),
    /isn't on your desktop/,
  );
  await assert.rejects(
    handleCmd("assign_bestie", { agentPubkey: PK, expectedRelayUrl: RELAY, expectedSignerPubkey: "ef".repeat(32) }, deps),
    /different account/,
  );
  await assert.rejects(handleCmd("assign_bestie", { agentPubkey: PK, expectedSignerPubkey: OWNER }, deps), /Missing relay/);
  assert.equal(
    await handleCmd("clear_bestie_assignment", { expectedRelayUrl: RELAY, expectedSignerPubkey: OWNER }, deps),
    null,
  );
  assert.deepEqual(calls.at(-1), [
    "clear_bestie_assignment",
    { expectedRelayUrl: RELAY, expectedSignerPubkey: OWNER },
  ]);
});
