import assert from "node:assert/strict";
import test from "node:test";

import { parsePlaygroundCard } from "@/features/playground/lib/card.ts";

test("playground fence JSON is parsed by the card helper used in fencedBlocks", () => {
  const card = parsePlaygroundCard(
    JSON.stringify({
      hula: "playground",
      v: 1,
      name: "Demo",
      url: "https://app.example.com",
      pin: "1",
      sid: "s1",
    }),
  );
  assert.equal(card?.hula, "playground");
  assert.equal(parsePlaygroundCard("nope"), null);
});
