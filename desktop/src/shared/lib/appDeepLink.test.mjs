import assert from "node:assert/strict";
import test from "node:test";

import {
  APP_DEEP_LINK_SCHEME,
  isAcceptedDeepLinkHref,
  isAcceptedDeepLinkProtocol,
  toAppDeepLink,
} from "./appDeepLink.ts";

test("toAppDeepLink rewrites buzz:// to hulabuzz://", () => {
  assert.equal(
    toAppDeepLink("buzz://channel/580ca78b-9dae-46f3-8854-bd671853ba32"),
    "hulabuzz://channel/580ca78b-9dae-46f3-8854-bd671853ba32",
  );
  assert.equal(
    toAppDeepLink("buzz://message?channel=abc&id=deadbeef&thread=deadbeef"),
    "hulabuzz://message?channel=abc&id=deadbeef&thread=deadbeef",
  );
});

test("toAppDeepLink leaves non-canonical hrefs alone", () => {
  assert.equal(toAppDeepLink("hulabuzz://channel/x"), "hulabuzz://channel/x");
  assert.equal(toAppDeepLink("https://example.com"), "https://example.com");
});

test("APP_DEEP_LINK_SCHEME is hulabuzz", () => {
  assert.equal(APP_DEEP_LINK_SCHEME, "hulabuzz");
});

test("isAcceptedDeepLinkProtocol accepts buzz and hulabuzz", () => {
  assert.equal(isAcceptedDeepLinkProtocol("buzz:"), true);
  assert.equal(isAcceptedDeepLinkProtocol("hulabuzz:"), true);
  assert.equal(isAcceptedDeepLinkProtocol("https:"), false);
  assert.equal(isAcceptedDeepLinkProtocol("buzz-demo-x:"), false);
});

test("isAcceptedDeepLinkHref matches message and channel hosts", () => {
  assert.equal(
    isAcceptedDeepLinkHref("buzz://message?channel=a&id=b", "message"),
    true,
  );
  assert.equal(
    isAcceptedDeepLinkHref("hulabuzz://message?channel=a&id=b", "message"),
    true,
  );
  assert.equal(isAcceptedDeepLinkHref("hulabuzz://message", "message"), true);
  assert.equal(
    isAcceptedDeepLinkHref(
      "hulabuzz://channel/580ca78b-9dae-46f3-8854-bd671853ba32",
      "channel",
    ),
    true,
  );
  assert.equal(isAcceptedDeepLinkHref("https://example.com", "message"), false);
  assert.equal(isAcceptedDeepLinkHref(undefined, "message"), false);
});
