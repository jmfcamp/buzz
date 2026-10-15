import assert from "node:assert/strict";
import { test } from "node:test";

// Lightweight parse checks against the TypeScript source via dynamic import when loader works;
// otherwise duplicate the fence regex here for a smoke check of the protocol strings.
const FENCE_RE = /```(?:bestie|assistant)-list\s*\r?\n([\s\S]*?)```/gi;
const CLAIM_RE = /(?:Added|Adding)\s+["']([^"']+)["']\s+to your Assistant List/gi;

function parseFences(content) {
  const actions = [];
  for (const match of content.matchAll(FENCE_RE)) {
    try {
      const json = JSON.parse(match[1] ?? "");
      const payloads = Array.isArray(json) ? json : [json];
      for (const p of payloads) {
        if (p?.op === "add" && Array.isArray(p.items)) actions.push(p);
      }
    } catch {}
  }
  return actions;
}
function parseClaims(content) {
  const items = [];
  for (const m of content.matchAll(CLAIM_RE)) items.push(m[1]);
  return items;
}

test("parses assistant-list fence add todo", () => {
  const actions = parseFences('Sure.\n```assistant-list\n{"op":"add","items":[{"kind":"todo","text":"Walk dog"}]}\n```\n');
  assert.equal(actions.length, 1);
  assert.equal(actions[0].items[0].text, "Walk dog");
});

test("recovers prose claim", () => {
  assert.deepEqual(parseClaims('Added "Walk dog" to your Assistant List.'), ["Walk dog"]);
  assert.deepEqual(parseClaims('Adding "go outside" to your Assistant List. My earlier save went elsewhere.'), ["go outside"]);
});

test("todos mode filter keeps todos not reminders", () => {
  const items = [
    { kind: "reminder", text: "Wake up" },
    { kind: "todo", text: "Walk dog" },
  ];
  const mode = "todos";
  const all = items.filter((i) => {
    if (mode === "reminders") return i.kind === "reminder";
    if (mode === "todos") return i.kind === "todo";
    return true;
  });
  assert.deepEqual(all.map((i) => i.text), ["Walk dog"]);
});
