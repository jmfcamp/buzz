import assert from "node:assert/strict";
import test, { mock } from "node:test";

import {
  KIND_COMMUNITY_BOTS,
  KIND_METADATA,
} from "@/shared/constants/kinds.ts";
import { relayClient } from "@/shared/api/relayClient.ts";

import { loadLocalCommunityBots } from "./catalog.ts";
import {
  completeCommunityBotInstall,
  completeCommunityBotRename,
} from "./installFlow.ts";

const MO_PUBKEY = "22".repeat(32);
const ADMIN_PUBKEY = "aa".repeat(32);
const RELAY_A = "wss://official.example.com";
const KIND_RELAY_ADMIN_ADD_MEMBER = 9030;

const AGENT = { id: "mo", name: "Mo", pubkey: MO_PUBKEY };
const MO = {
  id: "mo",
  name: "Mo",
  pubkey: MO_PUBKEY,
  source: "openclaw",
};

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
            pubkey: ADMIN_PUBKEY,
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

function membershipEvent(pubkeys) {
  return {
    id: "membership",
    pubkey: ADMIN_PUBKEY,
    kind: 13534,
    created_at: 1,
    content: "",
    tags: pubkeys.map((pubkey) => ["p", pubkey, "", "member"]),
    sig: "00",
  };
}

function stubRelay({
  catalogError = new Error("restricted: unknown event kind"),
  memberPubkeys = [],
  addMemberError,
} = {}) {
  const publish = mock.method(relayClient, "publishEvent", (event) => {
    if (event.kind === KIND_COMMUNITY_BOTS) {
      return catalogError ? Promise.reject(catalogError) : Promise.resolve();
    }
    if (event.kind === KIND_RELAY_ADMIN_ADD_MEMBER && addMemberError) {
      return Promise.reject(addMemberError);
    }
    if (event.kind === KIND_METADATA) {
      throw new Error(
        "invalid: event pubkey does not match authenticated identity",
      );
    }
    return Promise.resolve();
  });
  mock.method(relayClient, "fetchEvents", async () => []);
  mock.method(relayClient, "fetchFirstEvent", async () =>
    memberPubkeys.length > 0 ? membershipEvent(memberPubkeys) : null,
  );
  return publish;
}

function publishedEvents(publish) {
  return publish.mock.calls.map((call) => call.arguments[0]);
}

test("install defaults to the OpenClaw name and never publishes kind 0", async () => {
  installStorage();
  const publish = stubRelay({ catalogError: null });
  try {
    const next = await completeCommunityBotInstall({
      current: [],
      agent: AGENT,
      identity: { pubkey: MO_PUBKEY, minted: true },
      relayUrl: RELAY_A,
    });
    assert.equal(next[0].name, "Mo");
    assert.equal(loadLocalCommunityBots(RELAY_A)[0].name, "Mo");
    const events = publishedEvents(publish);
    assert.deepEqual(
      events.map((event) => event.kind),
      [KIND_RELAY_ADMIN_ADD_MEMBER, KIND_COMMUNITY_BOTS],
    );
    assert.equal(
      events.some(
        (event) =>
          event.kind === KIND_METADATA && event.pubkey !== ADMIN_PUBKEY,
      ),
      false,
    );
  } finally {
    mock.reset();
  }
});

test("install uses the admin-edited name for the catalog only", async () => {
  installStorage();
  const publish = stubRelay({ catalogError: null });
  try {
    const next = await completeCommunityBotInstall({
      current: [],
      agent: { id: "wayfinder", name: "", pubkey: null },
      displayName: " Wayfinder Desk ",
      identity: { pubkey: MO_PUBKEY, minted: true },
      relayUrl: RELAY_A,
    });
    assert.equal(next[0].id, "wayfinder");
    assert.equal(next[0].name, "Wayfinder Desk");
    assert.equal(loadLocalCommunityBots(RELAY_A)[0].name, "Wayfinder Desk");
    assert.equal(
      publishedEvents(publish).some((event) => event.kind === KIND_METADATA),
      false,
    );
  } finally {
    mock.reset();
  }
});

test("install skips kind 0 when the VPS provided the key", async () => {
  installStorage();
  const publish = stubRelay({ catalogError: null });
  try {
    await completeCommunityBotInstall({
      current: [],
      agent: AGENT,
      identity: { pubkey: MO_PUBKEY, minted: false },
      relayUrl: RELAY_A,
    });
    assert.equal(
      publishedEvents(publish).some((event) => event.kind === KIND_METADATA),
      false,
    );
  } finally {
    mock.reset();
  }
});

test("install keeps 9030 idempotent and 30624 unknown-kind local fallback", async () => {
  installStorage();
  const publish = stubRelay({
    memberPubkeys: [MO_PUBKEY],
  });
  try {
    const next = await completeCommunityBotInstall({
      current: [],
      agent: AGENT,
      displayName: "Mo Desk",
      identity: { pubkey: MO_PUBKEY, minted: true },
      relayUrl: RELAY_A,
    });
    assert.equal(next[0].name, "Mo Desk");
    const kinds = publishedEvents(publish).map((event) => event.kind);
    assert.equal(kinds.includes(KIND_RELAY_ADMIN_ADD_MEMBER), false);
    assert.equal(kinds.includes(KIND_COMMUNITY_BOTS), true);
    assert.equal(kinds.includes(KIND_METADATA), false);
    assert.deepEqual(loadLocalCommunityBots(RELAY_A), next);
  } finally {
    mock.reset();
  }
});

test("rename updates the catalog only and does not publish kind 0", async () => {
  installStorage();
  const publish = stubRelay({ catalogError: null, memberPubkeys: [MO_PUBKEY] });
  try {
    const next = await completeCommunityBotRename({
      current: [MO],
      bot: MO,
      displayName: "Captain",
      relayUrl: RELAY_A,
    });
    assert.equal(next[0].name, "Captain");
    assert.equal(loadLocalCommunityBots(RELAY_A)[0].name, "Captain");
    assert.equal(
      publishedEvents(publish).some((event) => event.kind === KIND_METADATA),
      false,
    );
    assert.equal(
      publishedEvents(publish).some(
        (event) => event.kind === KIND_COMMUNITY_BOTS,
      ),
      true,
    );
  } finally {
    mock.reset();
  }
});

test("rename still persists the catalog when 30624 is unknown", async () => {
  installStorage();
  const publish = stubRelay();
  try {
    const next = await completeCommunityBotRename({
      current: [MO],
      bot: MO,
      displayName: "Mo Desk",
      relayUrl: RELAY_A,
    });
    assert.equal(next[0].name, "Mo Desk");
    assert.equal(loadLocalCommunityBots(RELAY_A)[0].name, "Mo Desk");
    assert.equal(
      publishedEvents(publish).some((event) => event.kind === KIND_METADATA),
      false,
    );
  } finally {
    mock.reset();
  }
});
