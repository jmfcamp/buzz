import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("Me screen scroll container keeps children from flex-shrinking (Projects/Agents list collapsed to a bar)", () => {
  const src = readFileSync(new URL("./PhoneMeScreen.tsx", import.meta.url), "utf8");
  const m = src.match(/className="(phone-screen [^"]*)"/);
  assert.ok(m, "phone-screen container found");
  assert.match(m[1], /flex-col/);
  assert.match(m[1], /\[&>\*\]:shrink-0/);
});
