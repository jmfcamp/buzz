import assert from "node:assert/strict";
import test from "node:test";

import {
  computeInboxTabCounts,
  inboxTabOf,
  tabForFilter,
} from "./inboxTabs.ts";

const AGENT = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function item(o = {}) {
  return {
    id: o.id ?? "a",
    categories: o.categories ?? ["mention"],
    item: {
      id: o.id ?? "a",
      channelType: o.channelType ?? "group",
      pubkey: o.pubkey ?? "pk",
      tags: o.tags ?? [],
    },
    groupItems: [],
  };
}

test("items sort into Inbox vs Agents tabs", () => {
  const owned = new Set([AGENT]);
  assert.equal(inboxTabOf(item({ categories: ["mention"] }), owned), "inbox");
  assert.equal(inboxTabOf(item({ categories: ["needs_action"] }), owned), "agents");
  assert.equal(inboxTabOf(item({ categories: ["activity"], pubkey: AGENT }), owned), "agents");
  assert.equal(inboxTabOf(item({ categories: ["activity"] }), owned), null);
});

test("counts: per tab, done excluded, info agent items not counted, reminders added", () => {
  const owned = new Set([AGENT]);
  const items = [
    item({ id: "m" }),
    item({ id: "dm", channelType: "dm", categories: ["activity"] }),
    item({ id: "done" }),
    item({ id: "ap", categories: ["needs_action"] }),
    item({ id: "fin", categories: ["activity"], pubkey: AGENT, tags: [["agent-notify", "task_finished"]] }),
  ];
  const counts = computeInboxTabCounts({
    items,
    doneSet: new Set(["done"]),
    ownedAgentPubkeys: owned,
    dueReminderCount: 2,
  });
  assert.deepEqual(counts, { inbox: 2, agents: 1, reminders: 2, dueReminders: 2, assistant: 0, drafts: 0, total: 5 });
  const optIn = computeInboxTabCounts({
    items,
    doneSet: new Set(["done"]),
    ownedAgentPubkeys: owned,
    dueReminderCount: 0,
    countAgentInfoItems: true,
  });
  assert.equal(optIn.agents, 2);
});

test("tabForFilter keeps current tab when the filter belongs to it", () => {
  assert.equal(tabForFilter("all", "agents"), "agents");
  assert.equal(tabForFilter("drafts", "inbox"), "drafts");
  assert.equal(tabForFilter("channel", "agents"), "inbox");
  assert.equal(tabForFilter("needs_action", "inbox"), "agents");
  assert.equal(tabForFilter("mention", "agents"), "inbox");
});

test("assistant DM messages go to Reminders & Assistant and count there", () => {
  const owned = new Set([AGENT]);
  const msg = item({ id: "as", channelType: "dm", categories: ["activity"], pubkey: AGENT });
  assert.equal(inboxTabOf(msg, owned, AGENT), "reminders");
  assert.equal(inboxTabOf(msg, owned, null), "agents");
  const c = computeInboxTabCounts({
    items: [msg, item({ id: "m" })],
    doneSet: new Set(),
    ownedAgentPubkeys: owned,
    dueReminderCount: 1,
    assistantPubkey: AGENT,
  });
  assert.deepEqual(
    [c.inbox, c.agents, c.assistant, c.dueReminders, c.reminders, c.total],
    [1, 0, 1, 1, 2, 3],
  );
});

test("agent-notify kinds stay in Agents; failed/needs_input count, finished/pr do not", () => {
  const owned = new Set([AGENT]);
  const mk = (id, kind) => item({ id, categories: ["activity"], pubkey: AGENT, tags: [["agent-notify", kind]] });
  const c = computeInboxTabCounts({
    items: [mk("a", "needs_input"), mk("b", "failed"), mk("c", "task_finished"), mk("d", "pr_opened")],
    doneSet: new Set(),
    ownedAgentPubkeys: owned,
    dueReminderCount: 0,
  });
  assert.equal(c.agents, 2);
  assert.equal(tabForFilter("agent_failed", "inbox"), "agents");
});
