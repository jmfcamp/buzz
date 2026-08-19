import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { KIND_COMMUNITY_BOTS } from "@/shared/constants/kinds.ts";
import { relayClient } from "@/shared/api/relayClient.ts";

import {
  fetchCommunityBots,
  installCommunityBot,
  loadLocalCommunityBots,
  otherBotsSharePubkey,
  parseCommunityBotsPayload,
  publishCommunityBots,
  removeInstalledBot,
  selectLatestCommunityBots,
  uninstallCommunityBot,
  upsertInstalledBot,
} from "./catalog.ts";
import { communityBotsStorageKey } from "./localCatalog.ts";

const MO_PUBKEY = "22".repeat(32);

test("parseCommunityBotsPayload keeps valid openclaw bots", () => {
  const bots = parseCommunityBotsPayload(
    JSON.stringify({
      version: 1,
      bots: [
        { id: "mo", name: "Mo", pubkey: MO_PUBKEY, source: "openclaw" },
        { id: "bad", name: "Bad", pubkey: "not-a-key", source: "openclaw" },
        {
          id: "other",
          name: "Other",
          pubkey: "aa".repeat(32),
          source: "local",
        },
      ],
    }),
  );
  assert.equal(bots.length, 1);
  assert.equal(bots[0].id, "mo");
  assert.equal(bots[0].pubkey, MO_PUBKEY);
});

test("selectLatestCommunityBots uses the newest created_at", () => {
  const bots = selectLatestCommunityBots([
    {
      id: "older",
      kind: KIND_COMMUNITY_BOTS,
      created_at: 10,
      content: JSON.stringify({
        version: 1,
        bots: [
          {
            id: "old",
            name: "Old",
            pubkey: "aa".repeat(32),
            source: "openclaw",
          },
        ],
      }),
    },
    {
      id: "newer",
      kind: KIND_COMMUNITY_BOTS,
      created_at: 20,
      content: JSON.stringify({
        version: 1,
        bots: [
          {
            id: "main",
            name: "Main",
            pubkey: "bb".repeat(32),
            source: "openclaw",
          },
        ],
      }),
    },
  ]);
  assert.equal(bots.length, 1);
  assert.equal(bots[0].id, "main");
});

test("upsert and uninstall keep a shared pubkey installed", () => {
  const shared = "cc".repeat(32);
  const first = upsertInstalledBot([], {
    id: "mo",
    name: "Mo",
    pubkey: shared,
    source: "openclaw",
  });
  const both = upsertInstalledBot(first, {
    id: "captain",
    name: "Captain",
    pubkey: shared,
    source: "openclaw",
  });
  assert.equal(otherBotsSharePubkey(both, "mo", shared), true);
  const remaining = removeInstalledBot(both, "mo");
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].id, "captain");
});

const RELAY_A = "wss://official.example.com";
const RELAY_B = "wss://other.example.com";
const MO = {
  id: "mo",
  name: "Mo",
  pubkey: MO_PUBKEY,
  source: "openclaw",
};
const CAPTAIN = {
  id: "captain",
  name: "Captain",
  pubkey: "33".repeat(32),
  source: "openclaw",
};

const KIND_RELAY_ADMIN_ADD_MEMBER = 9030;
const KIND_RELAY_ADMIN_REMOVE_MEMBER = 9031;

function installStorage() {
  const memory = new Map();
  globalThis.window = {
    localStorage: {
      getItem(key) {
        return memory.has(key) ? memory.get(key) : null;
      },
      setItem(key, value) {
        memory.set(key, value);
      },
      removeItem(key) {
        memory.delete(key);
      },
    },
    __TAURI_INTERNALS__: {
      invoke: async (command, args) => {
        if (command === "sign_event") {
          return JSON.stringify({
            id: `signed-${args.kind}`,
            pubkey: "aa".repeat(32),
            kind: args.kind,
            created_at: 1,
            content: args.content,
            tags: args.tags,
            sig: "00",
          });
        }
        throw new Error(`Unexpected Tauri command: ${command}`);
      },
    },
  };
  return memory;
}

function catalogEvent(bots, createdAt = 20) {
  return {
    id: `evt-${createdAt}`,
    kind: KIND_COMMUNITY_BOTS,
    created_at: createdAt,
    content: JSON.stringify({ version: 1, bots }),
  };
}

function membershipEvent(pubkeys) {
  return {
    id: "membership",
    pubkey: "aa".repeat(32),
    kind: 13534,
    created_at: 1,
    content: "",
    tags: pubkeys.map((pubkey) => ["p", pubkey, "", "member"]),
    sig: "00",
  };
}

function publishedKinds(publish) {
  return publish.mock.calls.map((call) => call.arguments[0].kind);
}

function stubRelay({
  catalogError = new Error("restricted: unknown event kind"),
  catalogEvents = [],
  memberPubkeys = [],
  addMemberError,
  removeMemberError,
} = {}) {
  const publish = mock.method(relayClient, "publishEvent", (event) => {
    if (event.kind === KIND_COMMUNITY_BOTS) {
      return catalogError ? Promise.reject(catalogError) : Promise.resolve();
    }
    if (event.kind === KIND_RELAY_ADMIN_ADD_MEMBER && addMemberError) {
      return Promise.reject(addMemberError);
    }
    if (event.kind === KIND_RELAY_ADMIN_REMOVE_MEMBER && removeMemberError) {
      return Promise.reject(removeMemberError);
    }
    return Promise.resolve();
  });
  mock.method(relayClient, "fetchEvents", async () => catalogEvents);
  mock.method(relayClient, "fetchFirstEvent", async () =>
    memberPubkeys.length > 0 ? membershipEvent(memberPubkeys) : null,
  );
  return publish;
}

test("publishCommunityBots treats unknown event kind as a soft failure and writes local", async () => {
  installStorage();
  stubRelay();
  try {
    await publishCommunityBots([MO], RELAY_A);
    assert.deepEqual(loadLocalCommunityBots(RELAY_A), [MO]);
    assert.deepEqual(loadLocalCommunityBots(RELAY_B), []);
  } finally {
    mock.reset();
  }
});

test("publishCommunityBots writes the local catalog when 30624 is accepted", async () => {
  installStorage();
  stubRelay({ catalogError: null });
  try {
    await publishCommunityBots([MO], RELAY_A);
    assert.deepEqual(loadLocalCommunityBots(RELAY_A), [MO]);
  } finally {
    mock.reset();
  }
});

test("publishCommunityBots still rejects hard publish failures without writing local", async () => {
  installStorage();
  stubRelay({
    catalogError: new Error("Timed out while saving community bots."),
  });
  try {
    await assert.rejects(
      () => publishCommunityBots([MO], RELAY_A),
      /Timed out while saving community bots/,
    );
    assert.deepEqual(loadLocalCommunityBots(RELAY_A), []);
  } finally {
    mock.reset();
  }
});

test("fetchCommunityBots returns the local fallback when the relay has no 30624", async () => {
  installStorage();
  stubRelay();
  try {
    await publishCommunityBots([MO], RELAY_A);
    const bots = await fetchCommunityBots(RELAY_A);
    assert.equal(bots.length, 1);
    assert.equal(bots[0].id, "mo");
  } finally {
    mock.reset();
  }
});

test("fetchCommunityBots prefers 30624 on shared ids and keeps local-only ids", async () => {
  installStorage();
  stubRelay({
    catalogEvents: [catalogEvent([{ ...MO, name: "Mo from relay" }, CAPTAIN])],
  });
  try {
    const localOnly = {
      id: "local-only",
      name: "Local",
      pubkey: "44".repeat(32),
      source: "openclaw",
    };
    await publishCommunityBots([MO, localOnly], RELAY_A);
    const bots = await fetchCommunityBots(RELAY_A);
    assert.equal(bots.find((bot) => bot.id === "mo")?.name, "Mo from relay");
    assert.equal(
      bots.some((bot) => bot.id === "captain"),
      true,
    );
    assert.equal(
      bots.some((bot) => bot.id === "local-only"),
      true,
    );
  } finally {
    mock.reset();
  }
});

test("installCommunityBot succeeds when 30624 is rejected and skips a duplicate member add", async () => {
  installStorage();
  const publish = stubRelay({ memberPubkeys: [MO_PUBKEY] });
  try {
    const next = await installCommunityBot([], MO, RELAY_A);
    assert.equal(next[0].id, "mo");
    assert.equal(
      publishedKinds(publish).includes(KIND_RELAY_ADMIN_ADD_MEMBER),
      false,
    );
    assert.deepEqual(loadLocalCommunityBots(RELAY_A), next);
    assert.equal(
      globalThis.window.localStorage.getItem(communityBotsStorageKey(RELAY_B)),
      null,
    );
  } finally {
    mock.reset();
  }
});

test("installCommunityBot treats an already-member 9030 reject as success", async () => {
  installStorage();
  const publish = stubRelay({
    addMemberError: new Error("already a member"),
  });
  try {
    const next = await installCommunityBot([], MO, RELAY_A);
    assert.equal(next[0].id, "mo");
    assert.equal(
      publishedKinds(publish).includes(KIND_RELAY_ADMIN_ADD_MEMBER),
      true,
    );
    assert.deepEqual(loadLocalCommunityBots(RELAY_A), next);
  } finally {
    mock.reset();
  }
});

test("installCommunityBot persists the admin-chosen catalog name", async () => {
  installStorage();
  stubRelay({ catalogError: null });
  try {
    const next = await installCommunityBot(
      [],
      { ...MO, name: "Mo Desk" },
      RELAY_A,
    );
    assert.equal(next[0].name, "Mo Desk");
    assert.equal(loadLocalCommunityBots(RELAY_A)[0].name, "Mo Desk");
  } finally {
    mock.reset();
  }
});

test("installCommunityBot adds a member once when the pubkey is new", async () => {
  installStorage();
  const publish = stubRelay();
  try {
    await installCommunityBot([], MO, RELAY_A);
    assert.deepEqual(publishedKinds(publish), [
      KIND_RELAY_ADMIN_ADD_MEMBER,
      KIND_COMMUNITY_BOTS,
    ]);
  } finally {
    mock.reset();
  }
});

test("uninstallCommunityBot updates the local fallback when 30624 is rejected", async () => {
  installStorage();
  const publish = stubRelay({ memberPubkeys: [MO_PUBKEY] });
  try {
    const installed = await installCommunityBot([], MO, RELAY_A);
    const next = await uninstallCommunityBot(installed, MO, RELAY_A);
    assert.deepEqual(next, []);
    assert.deepEqual(loadLocalCommunityBots(RELAY_A), []);
    assert.equal(
      publishedKinds(publish).includes(KIND_RELAY_ADMIN_REMOVE_MEMBER),
      true,
    );
  } finally {
    mock.reset();
  }
});

test("uninstallCommunityBot treats an already-gone 9031 reject as success", async () => {
  installStorage();
  const publish = stubRelay({
    memberPubkeys: [MO_PUBKEY],
    removeMemberError: new Error(`member not found: ${MO_PUBKEY}`),
  });
  try {
    const installed = await installCommunityBot([], MO, RELAY_A);
    const next = await uninstallCommunityBot(installed, MO, RELAY_A);
    assert.deepEqual(next, []);
    assert.deepEqual(loadLocalCommunityBots(RELAY_A), []);
    assert.equal(
      publishedKinds(publish).includes(KIND_RELAY_ADMIN_REMOVE_MEMBER),
      true,
    );
  } finally {
    mock.reset();
  }
});

test("uninstallCommunityBot skips 9031 when listRelayMembers already omits them", async () => {
  installStorage();
  const publish = stubRelay({ memberPubkeys: [] });
  try {
    const installed = await installCommunityBot([], MO, RELAY_A);
    const next = await uninstallCommunityBot(installed, MO, RELAY_A);
    assert.deepEqual(next, []);
    assert.deepEqual(loadLocalCommunityBots(RELAY_A), []);
    assert.equal(
      publishedKinds(publish).includes(KIND_RELAY_ADMIN_REMOVE_MEMBER),
      false,
    );
  } finally {
    mock.reset();
  }
});

test("uninstallCommunityBot still fails on a hard 9031 error", async () => {
  installStorage();
  stubRelay({
    memberPubkeys: [MO_PUBKEY],
    removeMemberError: new Error("Timed out while updating relay access."),
  });
  try {
    const installed = await installCommunityBot([], MO, RELAY_A);
    await assert.rejects(
      () => uninstallCommunityBot(installed, MO, RELAY_A),
      /Timed out while updating relay access/,
    );
    assert.deepEqual(loadLocalCommunityBots(RELAY_A), installed);
  } finally {
    mock.reset();
  }
});

test("uninstallCommunityBot leaves a shared pubkey's relay membership intact", async () => {
  installStorage();
  const publish = stubRelay({ memberPubkeys: [MO_PUBKEY] });
  try {
    const shared = { ...CAPTAIN, pubkey: MO_PUBKEY };
    const both = await installCommunityBot(
      await installCommunityBot([], MO, RELAY_A),
      shared,
      RELAY_A,
    );
    await uninstallCommunityBot(both, MO, RELAY_A);
    assert.equal(
      publishedKinds(publish).includes(KIND_RELAY_ADMIN_REMOVE_MEMBER),
      false,
    );
    const remaining = loadLocalCommunityBots(RELAY_A);
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].id, "captain");
  } finally {
    mock.reset();
  }
});
