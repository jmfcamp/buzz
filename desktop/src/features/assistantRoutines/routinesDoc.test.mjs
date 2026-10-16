import assert from "node:assert/strict";
import test from "node:test";
import {
  WAKE_THE_BOTS_ID,
  composeChannelPost,
  defaultWakeChannel,
  deleteRoutine,
  emptyRoutinesDoc,
  listRoutines,
  matchRoutineInvocation,
  mergeRoutinesDoc,
  parseRoutinesDoc,
  pruneRoutinesDoc,
  routineSecretProblem,
  upsertRoutine,
} from "./routinesDoc.ts";

const prompt = (id, name) => ({
  id,
  name,
  action: { type: "assistant-prompt", prompt: "hi" },
});

test("Wake the bots is built in until edited or deleted", () => {
  const doc = emptyRoutinesDoc();
  assert.deepEqual(
    listRoutines(doc).map((r) => r.id),
    [WAKE_THE_BOTS_ID],
  );
  const del = deleteRoutine(doc, WAKE_THE_BOTS_ID, 10);
  assert.deepEqual(listRoutines(del), []);
  const edited = upsertRoutine(
    doc,
    { ...listRoutines(doc)[0], name: "Wake up" },
    10,
  );
  assert.deepEqual(
    listRoutines(edited).map((r) => r.name),
    ["Wake up"],
  );
});

test("merge is last-write-wins per routine, tombstone wins ties, commutative", () => {
  const a = upsertRoutine(emptyRoutinesDoc(), prompt("x", "A"), 10);
  const b = upsertRoutine(emptyRoutinesDoc(), prompt("x", "B"), 20);
  assert.equal(mergeRoutinesDoc(a, b).routines.x.routine.name, "B");
  assert.deepEqual(mergeRoutinesDoc(a, b), mergeRoutinesDoc(b, a));
  const d = deleteRoutine(emptyRoutinesDoc(), "x", 10);
  assert.equal(mergeRoutinesDoc(a, d).routines.x.on, false);
  assert.equal(mergeRoutinesDoc(d, a).routines.x.on, false);
});

test("parse round-trips, drops unknown action types, prune drops old tombstones", () => {
  let doc = upsertRoutine(emptyRoutinesDoc(), prompt("x", "A"), 10);
  doc = deleteRoutine(doc, "y", 10);
  assert.deepEqual(parseRoutinesDoc(JSON.parse(JSON.stringify(doc))), doc);
  const odd = parseRoutinesDoc({
    v: 1,
    routines: {
      z: { on: true, t: 1, routine: { name: "Z", action: { type: "future" } } },
    },
  });
  assert.deepEqual(odd.routines, {});
  assert.equal(pruneRoutinesDoc(doc, 10 + 61 * 86400).routines.y, undefined);
  assert.ok(pruneRoutinesDoc(doc, 10 + 61 * 86400).routines.x);
});

test("name invocation: exact name with optional run prefix only", () => {
  const rs = listRoutines(emptyRoutinesDoc());
  for (const t of [
    "Wake the bots",
    "wake the bots!",
    "run Wake the bots",
    "please run the routine wake the bots",
    "“Wake the bots.”",
  ])
    assert.equal(matchRoutineInvocation(t, rs)?.id, WAKE_THE_BOTS_ID, t);
  for (const t of [
    "should we wake the bots later?",
    "wake the bots and summarize",
    "bots",
  ])
    assert.equal(matchRoutineInvocation(t, rs), null, t);
});

test("post composes mentions + p-tags; default channel prefers jm-local-agents then most bots", () => {
  const out = composeChannelPost(
    {
      type: "post-to-channel",
      channelId: null,
      text: "Wake up!",
      mentionChannelBots: true,
    },
    [
      { pubkey: "AA", name: "Fizz" },
      { pubkey: "bb", name: "Opus" },
      { pubkey: "aa", name: "Fizz" },
    ],
  );
  assert.equal(out.content, "@Fizz @Opus @Fizz Wake up!");
  assert.deepEqual(out.mentionPubkeys, ["aa", "bb"]);
  const chs = [
    { id: "1", name: "hula" },
    { id: "2", name: "JM-local-agents" },
  ];
  assert.equal(defaultWakeChannel(chs)?.id, "2");
  assert.equal(
    defaultWakeChannel(
      [
        { id: "1", name: "a" },
        { id: "3", name: "b" },
      ],
      (c) => (c.id === "3" ? 5 : 1),
    )?.id,
    "3",
  );
});

test("secrets are refused", () => {
  assert.ok(
    routineSecretProblem({
      id: "x",
      name: "n",
      action: {
        type: "assistant-prompt",
        prompt: "use nsec1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq",
      },
    }),
  );
  assert.equal(routineSecretProblem(prompt("x", "fine")), null);
});
