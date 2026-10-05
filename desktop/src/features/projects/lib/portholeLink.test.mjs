import assert from "node:assert/strict";
import test from "node:test";

import { portholeTarget } from "./hulaProjectNames.ts";
import { findPortholePin, portholePathUrl } from "./portholeLink.ts";

test("the Porthole pin is found by name, then by mention", () => {
  const wayfinder = { name: "Wayfinder", url: "https://wayfinder.example" };
  const porthole = { name: "Porthole", url: "https://files.example" };
  const loose = { name: "My porthole", url: "https://x.example" };
  assert.equal(findPortholePin([wayfinder, loose, porthole]), porthole);
  assert.equal(findPortholePin([wayfinder, loose]), loose);
  assert.equal(
    findPortholePin([{ name: "Files", url: "https://porthole.example" }])?.url,
    "https://porthole.example",
  );
  assert.equal(findPortholePin([wayfinder]), null);
});

test("a Porthole URL opens at the Hula path", () => {
  const url = portholePathUrl(
    "https://porthole.example",
    "Hula/products/hulabill",
  );
  assert.equal(url, "https://porthole.example/?path=Hula/products/hulabill");
  assert.deepEqual(portholeTarget(url), {
    path: "Hula/products/hulabill",
    file: null,
  });
});

test("an existing path or file on the pin is replaced", () => {
  assert.equal(
    portholePathUrl(
      "https://porthole.example/app?path=Hula&file=a.ts",
      "Hula/projects/x",
    ),
    "https://porthole.example/app?path=Hula/projects/x",
  );
});

test("no path keeps the Porthole root; bad URLs are refused", () => {
  assert.equal(
    portholePathUrl("porthole.example", null),
    "https://porthole.example/",
  );
  assert.equal(portholePathUrl("", "Hula/x"), null);
  assert.equal(portholePathUrl("javascript:alert(1)", "Hula/x"), null);
});
