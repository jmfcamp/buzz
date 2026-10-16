import assert from "node:assert/strict";
import test from "node:test";

import { planRepositoryLinks } from "./hulaRepositoryLinks.ts";

const JM = "a".repeat(64);
const JOSH = "b".repeat(64);
const ROOT = "Hula/products/hulahealth";
const repo = (pubkey, d, path, channel, created_at = 1) => ({
  id: d, pubkey, created_at, kind: 30617, content: "", sig: "",
  tags: [["d", d], ["buzz-hula-path", path], ["buzz-channel", channel]],
});
const addr = (pk, d) => `30617:${pk}:${d}`;

test("owner sync links a collaborator's repo for a folder instead of re-creating it", () => {
  const project = {
    owner: JM,
    repositoryAddresses: [addr(JM, "hh")],
    repositories: [{ repoAddress: addr(JM, "hh"), hulaPath: ROOT }],
  };
  const plan = planRepositoryLinks(project, ROOT, [ROOT, `${ROOT}/app`], [
    repo(JM, "hh", ROOT, "c0"),
    repo(JOSH, "hh-app", `${ROOT}/app`, "c1"),
  ]);
  assert.ok(plan.known.has(`${ROOT}/app`));
  assert.deepEqual(plan.relinked, [addr(JOSH, "hh-app")]);
  assert.deepEqual(plan.relinkedChannelIds, ["c1"]);
});

test("wrong-author links are corrected and dead numbered copies are dropped", () => {
  const project = {
    owner: JM,
    repositoryAddresses: [
      addr(JM, "hh"),
      addr(JM, "hh-app"), // really Josh's
      addr(JOSH, "hh-app-3"), // deleted copy
      addr(JOSH, "hh-svc-2"), // deleted copy, svc is JM's
    ],
    repositories: [{ repoAddress: addr(JM, "hh"), hulaPath: ROOT }],
  };
  const plan = planRepositoryLinks(
    project,
    ROOT,
    [ROOT, `${ROOT}/app`, `${ROOT}/svc`],
    [
      repo(JM, "hh", ROOT, "c0"),
      repo(JOSH, "hh-app", `${ROOT}/app`, "c1"),
      repo(JM, "hh-svc", `${ROOT}/svc`, "c2"),
    ],
  );
  assert.deepEqual(plan.addresses.sort(), [
    addr(JM, "hh"), addr(JM, "hh-svc"), addr(JOSH, "hh-app"),
  ].sort());
  assert.equal(plan.replaced.get(addr(JM, "hh-app")), addr(JOSH, "hh-app"));
  assert.deepEqual([...plan.dropped].sort(), [addr(JOSH, "hh-app-3"), addr(JOSH, "hh-svc-2")].sort());
  assert.ok(plan.known.has(`${ROOT}/app`) && plan.known.has(`${ROOT}/svc`));
});

test("without an announcement list membership is unchanged", () => {
  const project = { owner: JM, repositoryAddresses: [addr(JOSH, "x-2")], repositories: [] };
  const plan = planRepositoryLinks(project, ROOT, [ROOT, `${ROOT}/x`], null);
  assert.deepEqual(plan.addresses, [addr(JOSH, "x-2")]);
  assert.equal(plan.dropped.size, 0);
  assert.equal(plan.known.has(`${ROOT}/x`), false);
});
