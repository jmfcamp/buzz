import assert from "node:assert/strict";
import test from "node:test";
import {
  leasePlaintext,
  leaseSubscriptions,
  leaseTags,
  parsePushDescriptor,
} from "./lease.ts";

const me = "a".repeat(64);
const info = {
  push: {
    origin: "wss://buzz.huladesk.com",
    keys: [{ id: "k1", pubkey: "b".repeat(64), current: true }],
    app_profiles: [
      { id: "buzz-ios-dogfood", transport: "apns" },
      { id: "buzz-web", transport: "webpush" },
    ],
    limitation: { max_lease_ttl: 2592000 },
  },
};

test("descriptor requires the buzz-web profile and one current key", () => {
  assert.equal(parsePushDescriptor(info)?.executorPubkey, "b".repeat(64));
  assert.equal(
    parsePushDescriptor({
      push: {
        ...info.push,
        app_profiles: [{ id: "buzz-ios-dogfood", transport: "apns" }],
      },
    }),
    null,
  );
  assert.equal(parsePushDescriptor({}), null);
});

test("subscriptions follow prefs; DMs and threads are relay-scoped", () => {
  const subs = leaseSubscriptions(me, {
    dm: true,
    mention: true,
    thread_reply: true,
    needs_action: true,
  });
  assert.deepEqual(
    subs.map((s) => s.class),
    ["mention", "needs_action", "reminder", "dm", "thread_reply"],
  );
  assert.deepEqual(subs[0].filter["#p"], [me]);
  const reminder = subs.find((s) => s.class === "reminder");
  assert.deepEqual(reminder.filter, { kinds: [30300], authors: [me] });
  assert.equal(subs.find((s) => s.class === "dm").scope, "dm");
  assert.equal(subs.find((s) => s.class === "thread_reply").scope, "thread");
  for (const s of subs.filter((s) => s.scope))
    assert.deepEqual(Object.keys(s.filter), ["kinds"]);
  assert.deepEqual(
    leaseSubscriptions(me, {
      dm: false,
      mention: false,
      thread_reply: false,
      needs_action: false,
      reminder: false,
    }),
    [],
  );
});

test("plaintext matches relay schema; empty => inactive", () => {
  const d = parsePushDescriptor(info);
  const active = JSON.parse(
    leasePlaintext({
      descriptor: d,
      generation: 5,
      grant: "G",
      subscriptions: leaseSubscriptions(me, {
        dm: false,
        mention: true,
        thread_reply: false,
        needs_action: false,
      }),
    }),
  );
  assert.deepEqual(Object.keys(active).sort(), [
    "active",
    "app_profile",
    "endpoint",
    "generation",
    "origin",
    "subscriptions",
    "transport",
    "v",
  ]);
  assert.equal(active.transport, "webpush");
  const off = JSON.parse(
    leasePlaintext({
      descriptor: d,
      generation: 6,
      grant: null,
      subscriptions: [],
    }),
  );
  assert.deepEqual(Object.keys(off).sort(), [
    "active",
    "generation",
    "origin",
    "v",
  ]);
  assert.deepEqual(
    leaseTags("inst", d, 99).map((t) => t[0]),
    ["d", "expiration", "exec", "alt"],
  );
});

test("leaseSubscriptions adds channel + followed-thread subs from interest", async () => {
  const { leaseSubscriptions } = await import("./lease.ts");
  const me = "a".repeat(64);
  const prefs = {
    mention: true,
    needs_action: true,
    dm: true,
    thread_reply: true,
  };
  const base = leaseSubscriptions(me, prefs);
  const withInterest = leaseSubscriptions(me, prefs, {
    channels: ["c1"],
    roots: ["r1"],
  });
  assert.equal(withInterest.length, base.length + 2);
  const channel = withInterest.find((s) => s.class === "channel");
  assert.deepEqual(channel.filter["#h"], ["c1"]);
  const followed = withInterest.find(
    (s) => s.class === "thread_reply" && s.filter["#e"],
  );
  assert.deepEqual(followed.filter["#e"], ["r1"]);
  const noThreads = leaseSubscriptions(
    me,
    { ...prefs, thread_reply: false },
    { channels: [], roots: ["r1"] },
  );
  assert.ok(!noThreads.some((s) => s.filter["#e"]));
});

const jeeves = "c".repeat(64);
const allOn = {
  dm: true,
  mention: true,
  thread_reply: true,
  needs_action: true,
  reminder: true,
  assistant_reply: true,
};

test("reminders follow the Reminders switch, not Approvals", () => {
  const classes = (p) =>
    leaseSubscriptions(me, { ...allOn, ...p }).map((s) => s.class);
  assert.ok(classes({ needs_action: false }).includes("reminder"));
  assert.ok(!classes({ needs_action: false }).includes("needs_action"));
  assert.ok(!classes({ reminder: false }).includes("reminder"));
  assert.ok(classes({ reminder: false }).includes("needs_action"));
});

test("assistant replies off: the assistant is ignored on the DM sub only", () => {
  const subs = leaseSubscriptions(
    me,
    { ...allOn, assistant_reply: false },
    undefined,
    {
      pubkey: jeeves,
    },
  );
  const dm = subs.find((s) => s.class === "dm");
  assert.deepEqual(dm.ignore, [
    { kinds: [9, 40002, 45001, 45003], authors: [jeeves] },
  ]);
  assert.deepEqual(Object.keys(dm.filter), ["kinds"]);
  assert.deepEqual(subs.find((s) => s.class === "mention").ignore, [
    { kinds: [9, 40002, 45001, 45003], authors: [me] },
  ]);
  // On: no ignore.
  const on = leaseSubscriptions(me, allOn, undefined, { pubkey: jeeves });
  assert.deepEqual(on.find((s) => s.class === "dm").ignore, []);
});

test("DMs off + assistant replies on keeps the DM sub only when the relay filters assistant replies", () => {
  const p = { ...allOn, dm: false };
  assert.ok(
    !leaseSubscriptions(me, p, undefined, { pubkey: jeeves }).some(
      (s) => s.class === "dm",
    ),
  );
  assert.ok(
    leaseSubscriptions(me, p, undefined, {
      pubkey: jeeves,
      relaySupportsAssistantReply: true,
    }).some((s) => s.class === "dm"),
  );
  assert.ok(
    !leaseSubscriptions(me, { ...p, assistant_reply: false }, undefined, {
      pubkey: jeeves,
      relaySupportsAssistantReply: true,
    }).some((s) => s.class === "dm"),
  );
});

test("descriptor reads pref_features", () => {
  assert.equal(parsePushDescriptor(info).assistantReplyPrefs, false);
  assert.equal(
    parsePushDescriptor({
      push: { ...info.push, pref_features: ["assistant_reply"] },
    }).assistantReplyPrefs,
    true,
  );
});
