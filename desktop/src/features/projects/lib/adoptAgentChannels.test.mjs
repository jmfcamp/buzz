import assert from "node:assert/strict";
import test from "node:test";
import { findAdoptableProjectChannels } from "./adoptAgentChannels.ts";

const JM = "56d9";
const MO = "d5c3";
const OTHER = "d102";
const ch = (id, name, createdBy, archivedAt = null) => ({
  id,
  name,
  createdBy,
  archivedAt,
});

test("adopts owner-agent channels with the project prefix only", () => {
  const ids = findAdoptableProjectChannels({
    projectChannelName: "products_hulahealth",
    ownerPubkey: JM,
    linkedChannelIds: new Set(["linked"]),
    creatorOwners: new Map([
      [MO, JM],
      [OTHER, null],
    ]),
    directory: [
      ch("4e55", "products_hulahealth_portal-shell-and-journeys", MO),
      ch("linked", "products_hulahealth_portal-app", JM),
      ch("arch", "products_hulahealth_old", MO, "2026-10-16"),
      ch("stranger", "products_hulahealth_x", OTHER),
      ch("other", "products_hulabill_y", MO),
      ch("home", "products_hulahealth", JM),
    ],
  });
  assert.deepEqual(ids, ["4e55"]);
});

test("explicit repair trusts the prefix when ownership is unprovable (web: relay as creator, no NIP-OA)", () => {
  const RELAY = "05c8";
  const ids = findAdoptableProjectChannels({
    projectChannelName: "products_hulahealth",
    ownerPubkey: JM,
    linkedChannelIds: new Set(["linked"]),
    creatorOwners: new Map(),
    trustNamePrefix: true,
    directory: [
      ch("4e55", "products_hulahealth_portal-shell-and-journeys", RELAY),
      ch("dup", "products_hulahealth_hulahealth-portal-app (2)", RELAY),
      ch("linked", "products_hulahealth_portal-app", RELAY),
      ch("arch", "products_hulahealth_old", RELAY, "2026-10-16"),
      ch("other", "products_hulabill_y", RELAY),
    ],
  });
  assert.deepEqual(ids, ["4e55"]);
});

test("auto sync still requires a provable owner", () => {
  const ids = findAdoptableProjectChannels({
    projectChannelName: "products_hulahealth",
    ownerPubkey: JM,
    linkedChannelIds: new Set(),
    creatorOwners: new Map(),
    directory: [
      ch("4e55", "products_hulahealth_portal-shell-and-journeys", "05c8"),
    ],
  });
  assert.deepEqual(ids, []);
});

test("tagged slug channels are adopted by tag + exact name, without creator proof", async () => {
  const {
    findTaggedSlugChannels,
    PROJECT_HOME_TAG: H,
    PROJECT_SLUG_TAG: S,
  } = await import("./adoptAgentChannels.ts");
  const HOME = "bc95409d";
  const t = (home, slug) => [
    ["h", "x"],
    ["name", "n"],
    [H, home],
    [S, slug],
  ];
  const ids = findTaggedSlugChannels({
    projectChannelName: "products_hulahealth",
    projectHomeChannelId: HOME,
    linkedChannelIds: new Set(["linked"]),
    directory: [
      { id: "ok", name: "products_hulahealth_portal", archivedAt: null },
      { id: "stack", name: "products_hulahealth_hulahealth-portal-app_journeys", archivedAt: null },
      { id: "untagged", name: "products_hulahealth_plain", archivedAt: null },
      { id: "otherhome", name: "products_hulahealth_x", archivedAt: null },
      { id: "mismatch", name: "products_hulahealth_y", archivedAt: null },
      { id: "dup", name: "products_hulahealth_portal (2)", archivedAt: null },
      { id: "arch", name: "products_hulahealth_old", archivedAt: "2026-10-16" },
      { id: "linked", name: "products_hulahealth_z", archivedAt: null },
    ],
    createTags: new Map([
      ["ok", t(HOME, "portal")],
      ["stack", t(HOME, "journeys")],
      ["otherhome", t("deadbeef", "x")],
      ["mismatch", t(HOME, "not-y")],
      ["dup", t(HOME, "portal")],
      ["arch", t(HOME, "old")],
      ["linked", t(HOME, "z")],
    ]),
  });
  assert.deepEqual(ids, ["ok", "stack"]);
});
