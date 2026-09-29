import assert from "node:assert/strict";
import test from "node:test";

import {
  reconcilePresentationWithNativeExists,
  shouldMountMainHuddleDrawerBar,
  shouldPromoteNoneToDrawer,
} from "./huddlePresentation.ts";

test("main must not mount drawer bar when presentation is window", () => {
  assert.equal(shouldMountMainHuddleDrawerBar("window"), false);
});

test("main mounts drawer bar only for drawer presentation", () => {
  assert.equal(shouldMountMainHuddleDrawerBar("drawer"), true);
  assert.equal(shouldMountMainHuddleDrawerBar("none"), false);
  assert.equal(shouldMountMainHuddleDrawerBar("window"), false);
});

test("native companion existence forces window presentation (heals desync)", () => {
  assert.equal(reconcilePresentationWithNativeExists("drawer", true), "window");
  assert.equal(reconcilePresentationWithNativeExists("none", true), "window");
  assert.equal(reconcilePresentationWithNativeExists("window", true), null);
});

test("missing companion while React says window docks to drawer when active", () => {
  assert.equal(
    reconcilePresentationWithNativeExists("window", false, {
      huddleActive: true,
    }),
    "drawer",
  );
  assert.equal(
    reconcilePresentationWithNativeExists("window", false, {
      huddleActive: false,
    }),
    "none",
  );
});

test("in-flight open must not demote window while exists is briefly false", () => {
  assert.equal(
    reconcilePresentationWithNativeExists("window", false, {
      openInFlight: true,
      huddleActive: true,
    }),
    null,
  );
});

test("drawer/none stay put when companion does not exist", () => {
  assert.equal(
    reconcilePresentationWithNativeExists("drawer", false, {
      huddleActive: true,
    }),
    null,
  );
  assert.equal(reconcilePresentationWithNativeExists("none", false), null);
});

test("none→drawer promote blocked during start pending or companion open", () => {
  assert.equal(
    shouldPromoteNoneToDrawer({
      presentation: "none",
      companionExists: false,
      openInFlight: false,
      startPending: true,
    }),
    false,
  );
  assert.equal(
    shouldPromoteNoneToDrawer({
      presentation: "none",
      companionExists: false,
      openInFlight: true,
      startPending: false,
    }),
    false,
  );
  assert.equal(
    shouldPromoteNoneToDrawer({
      presentation: "window",
      companionExists: false,
      openInFlight: false,
      startPending: false,
    }),
    false,
  );
});

test("none→drawer promote allowed when settled with no companion", () => {
  assert.equal(
    shouldPromoteNoneToDrawer({
      presentation: "none",
      companionExists: false,
      openInFlight: false,
      startPending: false,
    }),
    true,
  );
  assert.equal(
    shouldPromoteNoneToDrawer({
      presentation: "none",
      companionExists: false,
      openInFlight: false,
      startPending: false,
    }),
    true,
  );
});
