import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { JSDOM } from "jsdom";

import { CommunitiesProvider } from "@/features/communities/useCommunities.tsx";
import { myRelayMembershipLookupQueryKey } from "@/features/community-members/hooks.ts";
import { ThemeProvider } from "@/shared/theme/ThemeProvider.tsx";

import {
  communityPinnedSitesQueryKey,
  personalPinnedSitesQueryKey,
} from "../hooks.ts";
import { WAYFINDER_PIN } from "../lib/types.ts";
import { PinnedSitesSettingsCard } from "./PinnedSitesSettingsCard.tsx";

const PUBKEY = "a".repeat(64);
const RELAY_URL = "wss://relay.example.com";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost",
});

before(() => {
  Object.assign(globalThis, {
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
    localStorage: dom.window.localStorage,
    window: dom.window,
  });
  dom.window.matchMedia = () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  });
  dom.window.localStorage.setItem(
    "buzz-communities",
    JSON.stringify([
      {
        addedAt: "2026-01-01T00:00:00.000Z",
        id: "community-1",
        name: "Test",
        relayUrl: RELAY_URL,
      },
    ]),
  );
  dom.window.localStorage.setItem("buzz-active-community-id", "community-1");
});

afterEach(async () => {
  const { cleanup } = await import("@testing-library/react");
  cleanup();
});

after(() => dom.window.close());

async function renderCard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(["identity"], { pubkey: PUBKEY });
  queryClient.setQueryData(
    [...personalPinnedSitesQueryKey, PUBKEY, RELAY_URL],
    {
      pins: [{ ...WAYFINDER_PIN }],
      version: 1,
      wayfinderSeeded: true,
    },
  );
  queryClient.setQueryData(communityPinnedSitesQueryKey, []);
  queryClient.setQueryData(myRelayMembershipLookupQueryKey, {
    membership: { pubkey: PUBKEY, role: "owner" },
    membershipRequired: true,
    snapshotFound: true,
  });

  const { createElement } = await import("react");
  const { render, screen } = await import("@testing-library/react");
  render(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        CommunitiesProvider,
        null,
        createElement(
          ThemeProvider,
          { defaultTheme: "buzz" },
          createElement(PinnedSitesSettingsCard),
        ),
      ),
    ),
  );
  return screen;
}

test("Pinned sites settings card renders the heading and Add button", async () => {
  const screen = await renderCard();

  assert.ok(screen.getByTestId("settings-pinned-sites"));
  assert.ok(screen.getByRole("heading", { name: "Pinned sites" }));
  assert.ok(screen.getByTestId("pinned-sites-add"));
  assert.equal(screen.getByTestId("pinned-sites-add").textContent, "Add");
  assert.ok(screen.getByTestId("pinned-site-row-wayfinder"));
});
