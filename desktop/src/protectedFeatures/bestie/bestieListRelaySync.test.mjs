import assert from "node:assert/strict";
import test from "node:test";

import {
  emptyListsDoc,
  liveItems,
} from "../../features/assistantLists/listsDoc.ts";
import {
  claimReminderFires,
  setActiveListsEngine,
} from "../../features/assistantLists/listsStore.ts";
import { writeBestieListState } from "./bestieListStorage.ts";
import {
  __resetBestieListStoreForTests,
  addBestieListItemForScope,
  applyBestieListActionsFromAgentMessage,
  getBestieListState,
} from "./bestieListStore.ts";

const SCOPE = {
  agentPubkey: "c".repeat(64),
  ownerPubkey: "d".repeat(64),
  relayUrl: "wss://relay.test",
};

test("desktop store migrates localStorage once, then reads/writes the relay doc; LS stays read-only", () => {
  const memory = new Map();
  globalThis.window = {
    dispatchEvent: () => true,
    localStorage: {
      getItem: (k) => memory.get(k) ?? null,
      removeItem: (k) => void memory.delete(k),
      setItem: (k, v) => void memory.set(k, String(v)),
    },
  };
  globalThis.Event = class {
    constructor(t) {
      this.type = t;
    }
  };
  __resetBestieListStoreForTests();
  addBestieListItemForScope(SCOPE, { kind: "todo", text: "local only" });
  const lsKeys = [...memory.keys()];
  const lsBefore = JSON.stringify([...memory.values()]);

  const engine = {
    pk: SCOPE.ownerPubkey,
    doc: emptyListsDoc(),
    update(next) {
      this.doc = next;
    },
  };
  setActiveListsEngine(engine, SCOPE.relayUrl);
  assert.deepEqual(
    liveItems(engine.doc).map((i) => i.text),
    ["local only"],
  );
  assert.equal(getBestieListState(SCOPE).items.length, 1);

  // Re-start: no double migration.
  setActiveListsEngine(engine, SCOPE.relayUrl);
  assert.equal(liveItems(engine.doc).length, 1);

  addBestieListItemForScope(SCOPE, {
    kind: "reminder",
    text: "call",
    dueAt: 10,
  });
  assert.equal(liveItems(engine.doc).length, 2);
  assert.equal(getBestieListState(SCOPE).items.length, 2);
  // localStorage list data untouched after migration (only the migrated marker was added).
  assert.equal(JSON.stringify(lsKeys.map((k) => memory.get(k))), lsBefore);

  // Agent message ids are synced so another device doesn't apply them twice.
  applyBestieListActionsFromAgentMessage(
    SCOPE,
    "msg-9",
    '```bestie-list\n{"op":"add","items":[{"kind":"todo","text":"x"}]}\n```',
  );
  assert.ok("msg-9" in engine.doc.processed);

  // Wake firer: first claim fires, second (other device) sees firedAt and skips.
  const rid = liveItems(engine.doc).find((i) => i.kind === "reminder").id;
  assert.deepEqual(claimReminderFires(SCOPE.ownerPubkey, [rid]), [rid]);
  assert.deepEqual(claimReminderFires(SCOPE.ownerPubkey, [rid]), []);
  setActiveListsEngine(null);
  assert.equal(claimReminderFires(SCOPE.ownerPubkey, [rid]), null);
  void writeBestieListState;
});
