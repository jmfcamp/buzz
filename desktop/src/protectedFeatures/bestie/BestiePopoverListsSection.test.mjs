/**
 * Open Lists keeps the category-row block as its height. Opening Reminders
 * overlays that block and scrolls inside it. A short list must not replace
 * the block and shrink it.
 */

import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { after, before, test } from "node:test";
import { JSDOM } from "jsdom";

const LIST_STUBS = {
  "./BestieDmThreadsSheet": "buzz-lists-stub:threads-sheet",
  "./useBestieCoffeeLive": "buzz-lists-stub:coffee-live",
  "./useBestieThreadSummarizeLive": "buzz-lists-stub:summarize-live",
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    const stub = LIST_STUBS[specifier];
    if (stub) return { shortCircuit: true, url: stub };
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === "buzz-lists-stub:threads-sheet") {
      return {
        format: "module",
        shortCircuit: true,
        source: "export function BestieDmThreadsSheet(){ return null; }\n",
      };
    }
    if (url === "buzz-lists-stub:coffee-live") {
      return {
        format: "module",
        shortCircuit: true,
        source:
          "export function useBestieCoffeeLive(){ return { brewDisabled: false, coffeeLive: false }; }\n",
      };
    }
    if (url === "buzz-lists-stub:summarize-live") {
      return {
        format: "module",
        shortCircuit: true,
        source:
          "export function useBestieThreadSummarizeLive(){ return { summarizeDisabled: false, summarizeLive: false, summarizeLiveThreadId: null }; }\n",
      };
    }
    return nextLoad(url, context);
  },
});

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost",
});

before(() => {
  Object.assign(globalThis, {
    document: dom.window.document,
    Element: dom.window.Element,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
    Node: dom.window.Node,
    window: dom.window,
  });
});

after(() => {
  dom.window.close();
});

function scope() {
  return {
    agentPubkey: "a".repeat(64),
    ownerPubkey: "b".repeat(64),
    relayUrl: "wss://relay.example/lists-height",
  };
}

test("an open list keeps the category block and scrolls inside it", async () => {
  const React = await import("react");
  const { QueryClient, QueryClientProvider } = await import(
    "@tanstack/react-query"
  );
  const { cleanup, fireEvent, render, screen } = await import(
    "@testing-library/react"
  );
  const { addBestieListItemForScope, __resetBestieListStoreForTests } =
    await import("./bestieListStore.ts");
  const { emptyBestieListState, writeBestieListState } = await import(
    "./bestieListStorage.ts"
  );
  const { setBestiePopoverListsCollapsed } = await import(
    "./bestiePopoverListsPreference.ts"
  );
  const { BestiePopoverListsSection } = await import(
    "./BestiePopoverListsSection.tsx"
  );

  const listScope = scope();
  setBestiePopoverListsCollapsed(false);
  const added = addBestieListItemForScope(listScope, {
    kind: "reminder",
    text: "One short reminder",
  });
  const reminder = added.items.find((item) => item.kind === "reminder");
  assert.ok(reminder);

  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  try {
    render(
      React.createElement(
        QueryClientProvider,
        { client },
        React.createElement(BestiePopoverListsSection, {
          brewEnabled: false,
          scope: listScope,
        }),
      ),
    );

    const body = screen.getByTestId("bestie-popover-lists-body");
    const openClass = body.className;
    assert.doesNotMatch(openClass, /max-h-/);
    assert.equal(screen.queryByTestId("bestie-popover-lists-sheet"), null);
    const panel = screen.getByTestId("bestie-dm-rhs-panel");
    assert.equal(panel.parentElement?.hasAttribute("inert"), false);

    fireEvent.click(screen.getByTestId("bestie-rhs-reminders"));

    assert.equal(
      screen.getByTestId("bestie-popover-lists-body").className,
      openClass,
    );
    const held = screen.getByTestId("bestie-dm-rhs-panel");
    assert.equal(held.parentElement?.getAttribute("aria-hidden"), "true");
    assert.equal(held.parentElement?.hasAttribute("inert"), true);
    assert.match(held.parentElement?.className ?? "", /\binvisible\b/);
    const sheet = screen.getByTestId("bestie-popover-lists-sheet");
    assert.equal(sheet.parentElement, body);
    assert.match(sheet.className, /\babsolute\b/);
    assert.match(sheet.className, /\binset-0\b/);
    assert.match(sheet.className, /overflow-y-auto/);
    assert.equal(body.contains(sheet), true);
    assert.equal(
      sheet.contains(screen.getByTestId(`bestie-list-item-${reminder.id}`)),
      true,
    );

    fireEvent.click(screen.getByTestId("bestie-popover-lists-back"));
    assert.equal(screen.queryByTestId("bestie-popover-lists-sheet"), null);
    assert.equal(
      screen
        .getByTestId("bestie-dm-rhs-panel")
        .parentElement?.hasAttribute("aria-hidden"),
      false,
    );
  } finally {
    cleanup();
    writeBestieListState(listScope, emptyBestieListState());
    setBestiePopoverListsCollapsed(true);
    __resetBestieListStoreForTests();
    client.clear();
  }
});
