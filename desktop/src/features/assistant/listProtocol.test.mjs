import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assistantListTurnHint,
  stripAssistantListHint,
  stripAssistantTurnHints,
} from "./listProtocol.ts";

test("strips the web Assistant lists hint", () => {
  assert.equal(
    stripAssistantListHint(`Add milk${assistantListTurnHint()}`),
    "Add milk",
  );
});

test("strips the desktop live-lists block sent with a single newline", () => {
  const body =
    "Hi\n[Bestie live lists]\nLive Assistant list state from owner-scoped RHS storage (authoritative).\n\nOpen to-dos (0):\n(none)\n\nOpen reminders (1):\n- [abc] CHA\n\nJobs summary (0 enabled / 0 total):\n(none enabled; 0 total)\n";
  assert.equal(stripAssistantTurnHints(body), "Hi");
});

test("strips desktop lists / jobs hints after a blank line", () => {
  assert.equal(
    stripAssistantTurnHints("Remind me\n\n[Bestie lists]\nWhen mutating..."),
    "Remind me",
  );
  assert.equal(
    stripAssistantTurnHints("Schedule it\n\n[Bestie jobs]\nJob setup..."),
    "Schedule it",
  );
});

test("cuts at the earliest marker when several hints are appended", () => {
  assert.equal(
    stripAssistantTurnHints(
      "Hi\n[Bestie live lists]\nstate\n\n[Bestie lists]\nmore",
    ),
    "Hi",
  );
});

test("a hint-only body renders empty; ordinary text is untouched", () => {
  assert.equal(stripAssistantTurnHints("[Assistant lists]\nYou are..."), "");
  assert.equal(
    stripAssistantTurnHints("see [Bestie lists] inline"),
    "see [Bestie lists] inline",
  );
  assert.equal(stripAssistantTurnHints("plain message"), "plain message");
  assert.equal(stripAssistantTurnHints(undefined), "");
});
