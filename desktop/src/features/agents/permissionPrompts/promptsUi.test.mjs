import test from "node:test"; import assert from "node:assert/strict";
const m = await import("./promptsUi.ts");
test("expiry heuristic", () => { assert.equal(m.looksExpired({createdAt:1000},1115), true); assert.equal(m.looksExpired({createdAt:1000},1050), false); assert.match(m.expiredNoteText({agentName:"Opus",title:"Run ls"}), /timed out after 2 min/); });
