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
  assert.deepEqual(counts, { inbox: 2, agents: 1, reminders: 2, total: 5 });
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
  assert.equal(tabForFilter("drafts", "inbox"), "reminders");
  assert.equal(tabForFilter("needs_action", "inbox"), "agents");
  assert.equal(tabForFilter("mention", "agents"), "inbox");
});
