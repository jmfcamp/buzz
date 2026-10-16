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
