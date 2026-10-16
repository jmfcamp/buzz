import assert from "node:assert/strict";
import test from "node:test";
import { deleteChannelUnarchivingIfNeeded } from "./deleteArchivedChannel.ts";

function deps(script) {
  const calls = [];
  const mk = (name) => async (id) => {
    calls.push(`${name}:${id}`);
    const next = script[name]?.shift();
    if (next) throw new Error(next);
  };
  return {
    calls,
    d: {
      deleteChannel: mk("delete"),
      unarchiveChannel: mk("unarchive"),
      archiveChannel: mk("archive"),
    },
  };
}

test("non-archived deletes directly", async () => {
  const { calls, d } = deps({});
  await deleteChannelUnarchivingIfNeeded("c", false, d);
  assert.deepEqual(calls, ["delete:c"]);
});
test("known archived unarchives then deletes", async () => {
  const { calls, d } = deps({});
  await deleteChannelUnarchivingIfNeeded("c", true, d);
  assert.deepEqual(calls, ["unarchive:c", "delete:c"]);
});
test("stale flag: relay says archived -> unarchive + delete", async () => {
  const { calls, d } = deps({
    delete: ["400 Bad Request: invalid: channel is archived"],
  });
  await deleteChannelUnarchivingIfNeeded("c", false, d);
  assert.deepEqual(calls, ["delete:c", "unarchive:c", "delete:c"]);
});
test("other delete error is rethrown untouched", async () => {
  const { calls, d } = deps({ delete: ["forbidden"] });
  await assert.rejects(
    deleteChannelUnarchivingIfNeeded("c", false, d),
    /forbidden/,
  );
  assert.deepEqual(calls, ["delete:c"]);
});
test("unarchive failure leaves channel archived", async () => {
  const { calls, d } = deps({ unarchive: ["nope"] });
  await assert.rejects(
    deleteChannelUnarchivingIfNeeded("c", true, d),
    /still archived/,
  );
  assert.deepEqual(calls, ["unarchive:c"]);
});
test("delete failure after unarchive re-archives", async () => {
  const { calls, d } = deps({ delete: ["boom"] });
  await assert.rejects(
    deleteChannelUnarchivingIfNeeded("c", true, d),
    /re-archived and is unchanged/,
  );
  assert.deepEqual(calls, ["unarchive:c", "delete:c", "archive:c"]);
});
test("delete and re-archive failure says UNARCHIVED", async () => {
  const { d } = deps({ delete: ["boom"], archive: ["x"] });
  await assert.rejects(
    deleteChannelUnarchivingIfNeeded("c", true, d),
    /now UNARCHIVED/,
  );
});
