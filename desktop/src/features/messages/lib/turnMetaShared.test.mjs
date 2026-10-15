import assert from "node:assert/strict";
import test from "node:test";

import {
  getSharedTranscriptBuildCount,
  isHydrationLeader,
  joinHydration,
  leaveHydration,
  publishHasOlderArchived,
  readSharedHasOlderArchived,
  resolveTurnMetaTranscript,
} from "./turnMetaShared.ts";

const CH = "cafd05ca-0000-0000-0000-000000000000";
function frame(seq, channelId = CH, timestamp = "2026-10-15T00:00:00Z") {
  return {
    seq,
    timestamp,
    kind: "acp_read",
    agentIndex: 0,
    channelId,
    sessionId: "s",
    turnId: "t1",
    payload: {
      method: "session/update",
      params: {
        sessionId: "s",
        update: {
          sessionUpdate: "agent_thought_chunk",
          content: { type: "text", text: `thought ${seq}` },
        },
      },
    },
  };
}

test("36 agent replies with the same inputs build the transcript once", () => {
  const live = [frame(1), frame(2)];
  const archived = [frame(0)];
  const before = getSharedTranscriptBuildCount();
  const results = [];
  for (let i = 0; i < 36; i++) {
    // Replies hours apart: no nearby null-channel frames.
    results.push(
      resolveTurnMetaTranscript(live, archived, CH, 1_700_000_000 + i * 60),
    );
  }
  assert.equal(getSharedTranscriptBuildCount() - before, 1);
  for (const r of results) assert.equal(r, results[0]);
  assert.ok(results[0].combined.length >= 2);
});

test("a new live frame (new array) rebuilds once, not per reply", () => {
  const archived = [frame(0)];
  const live1 = [frame(1)];
  const live2 = [...live1, frame(2)];
  resolveTurnMetaTranscript(live1, archived, CH, 1);
  const before = getSharedTranscriptBuildCount();
  for (let i = 0; i < 36; i++)
    resolveTurnMetaTranscript(live2, archived, CH, i);
  assert.equal(getSharedTranscriptBuildCount() - before, 1);
});

test("a reply near a null-channel live frame still includes it", () => {
  const ts = "2026-10-15T00:00:00Z";
  const created = Date.parse(ts) / 1000 + 30;
  const live = [frame(1), frame(2, null, ts)];
  const near = resolveTurnMetaTranscript(live, [], CH, created);
  const far = resolveTurnMetaTranscript(live, [], CH, created + 3600);
  assert.equal(near.combined.length, 2);
  assert.equal(far.combined.length, 1);
});

test("only the first mounted reply per channel hydrates the archive", () => {
  joinHydration(CH, "a");
  joinHydration(CH, "b");
  assert.equal(isHydrationLeader(CH, "a"), true);
  assert.equal(isHydrationLeader(CH, "b"), false);
  publishHasOlderArchived(CH, false);
  assert.equal(readSharedHasOlderArchived(CH), false);
  leaveHydration(CH, "a");
  assert.equal(isHydrationLeader(CH, "b"), true);
  leaveHydration(CH, "b");
  assert.equal(isHydrationLeader(null, "b"), false);
});
