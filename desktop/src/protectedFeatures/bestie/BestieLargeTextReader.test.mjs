/**
 * The Assistant list rows for coffee, thread summaries, and scratch notes
 * open the production fullscreen reader. Compact rows stay in place. A scratch
 * edit survives leaving the reader.
 */

import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { after, before, test } from "node:test";
import { JSDOM } from "jsdom";

const goChannelCalls = [];

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/features/channels/hooks") {
      return { shortCircuit: true, url: "buzz-bestie-stub:channels-hooks" };
    }
    if (specifier === "@/app/navigation/useAppNavigation") {
      return { shortCircuit: true, url: "buzz-bestie-stub:navigation" };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === "buzz-bestie-stub:channels-hooks") {
      return {
        format: "module",
        shortCircuit: true,
        source:
          "const data = [];\nexport function useChannelsQuery(){ return { data }; }\n",
      };
    }
    if (url === "buzz-bestie-stub:navigation") {
      return {
        format: "module",
        shortCircuit: true,
        source: `export function useAppNavigation(){
          return { goChannel(...args){
            globalThis.__bestieGoChannelCalls.push(args);
            return Promise.resolve();
          } };
        }\n`,
      };
    }
    return nextLoad(url, context);
  },
});

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost",
});

before(() => {
  globalThis.__bestieGoChannelCalls = goChannelCalls;
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

function scope(relayUrl) {
  return {
    agentPubkey: "a".repeat(64),
    ownerPubkey: "b".repeat(64),
    relayUrl,
  };
}

test("coffee rows open the full briefing without expanding the small row", async () => {
  const React = await import("react");
  const { cleanup, fireEvent, render, screen } = await import(
    "@testing-library/react"
  );
  const { writeBestieCoffeeState, emptyBestieCoffeeState } = await import(
    "./bestieCoffeeStorage.ts"
  );
  const { BestieDmCoffeeSheet } = await import("./BestieDmCoffeeSheet.tsx");
  const { bestieLargeTextOpenLabel } = await import(
    "./bestieLargeTextTarget.ts"
  );

  const coffeeScope = scope("wss://relay.example/coffee-reader");
  const full =
    "Ship the notes view.\n\nThe list only keeps the one-line brief.";
  writeBestieCoffeeState(coffeeScope, {
    ...emptyBestieCoffeeState(),
    entries: [
      {
        brief: "Ship the notes view.",
        fullOutput: full,
        id: "coffee-1",
        ranAt: 1_700_000_000,
        replyMessageId: null,
        source: "brew",
        triggerMessageId: null,
      },
      {
        brief: "Other morning.",
        fullOutput: "Other morning full text.",
        id: "coffee-2",
        ranAt: 1_700_000_100,
        replyMessageId: null,
        source: "scheduled",
        triggerMessageId: null,
      },
    ],
  });

  try {
    render(
      React.createElement(BestieDmCoffeeSheet, {
        brewDisabled: false,
        coffeeLive: false,
        onBrew() {},
        scope: coffeeScope,
      }),
    );

    assert.equal(screen.queryByTestId("bestie-coffee-expand-coffee-1"), null);
    const heading = screen
      .getByTestId("bestie-coffee-item-coffee-1")
      .querySelector("p").textContent;
    const open = screen.getByTestId(
      "bestie-large-text-open-coffee-1-fullscreen",
    );
    assert.equal(
      open.getAttribute("aria-label"),
      bestieLargeTextOpenLabel(heading),
    );
    fireEvent.click(open);
    assert.equal(screen.queryByTestId("bestie-coffee-expand-coffee-1"), null);
    const reader = screen.getByTestId("bestie-large-text-reader");
    assert.equal(reader.getAttribute("data-mode"), "fullscreen");
    assert.match(reader.style.top, /var\(--buzz-top-chrome-height,\s*40px\)/);
    assert.match(
      screen.getByTestId("bestie-large-text-shade").style.top,
      /var\(--buzz-top-chrome-height,\s*40px\)/,
    );
    assert.doesNotMatch(reader.style.top, /^\s*0/);
    assert.equal(
      screen.getByTestId("bestie-large-text-body").textContent,
      full,
    );
    assert.equal(
      screen.queryByTestId("bestie-large-text-open-coffee-1-window"),
      null,
    );
    assert.equal(screen.queryByTestId("bestie-large-text-mode-window"), null);
    assert.equal(screen.queryByText("Other morning full text."), null);
    fireEvent.click(screen.getByTestId("bestie-large-text-backdrop"));
    assert.equal(screen.queryByTestId("bestie-large-text-reader"), null);
    assert.ok(screen.getByTestId("bestie-coffee-item-coffee-1"));
  } finally {
    cleanup();
  }
});

test("thread summary rows open the summary and do not open the channel", async () => {
  const React = await import("react");
  const { cleanup, fireEvent, render, screen } = await import(
    "@testing-library/react"
  );
  const { writeBestieThreadState } = await import("./bestieThreadStorage.ts");
  const { BestieDmThreadsSheet } = await import("./BestieDmThreadsSheet.tsx");

  const threadScope = scope("wss://relay.example/thread-reader");
  const summary =
    "Decisions from the thread.\n\nKeep the long form out of the row.";
  writeBestieThreadState(threadScope, {
    pendingSummarize: null,
    threads: [
      {
        addedAt: 1_700_000_000,
        authorName: null,
        channelId: "chan-1",
        channelName: "general",
        id: "chan-1:root-1",
        lastActiveAt: 1_700_000_000,
        lastSummary: summary,
        lastSummaryAt: 1_700_000_100,
        preview: "short preview",
        rootEventId: "root-1",
        source: "ask",
      },
    ],
    version: 1,
  });
  goChannelCalls.length = 0;

  try {
    render(
      React.createElement(BestieDmThreadsSheet, {
        adding: false,
        scope: threadScope,
      }),
    );
    assert.equal(
      screen.queryByTestId("bestie-thread-summary-chan-1:root-1"),
      null,
    );
    fireEvent.click(
      screen.getByTestId("bestie-large-text-open-chan-1:root-1-fullscreen"),
    );
    assert.equal(
      screen.getByTestId("bestie-large-text-body").textContent,
      summary,
    );
    assert.equal(
      screen.getByTestId("bestie-large-text-reader").getAttribute("data-mode"),
      "fullscreen",
    );
    assert.equal(
      screen.queryByTestId("bestie-large-text-open-chan-1:root-1-window"),
      null,
    );
    assert.equal(
      screen.queryByTestId("bestie-thread-summary-chan-1:root-1"),
      null,
    );
    assert.deepEqual(goChannelCalls, []);
  } finally {
    cleanup();
  }
});

test("scratch rows open the note and keep an edit made in the reader", async () => {
  const React = await import("react");
  const { cleanup, fireEvent, render, screen } = await import(
    "@testing-library/react"
  );
  const { addBestieScratchNoteForScope, getBestieScratchState } = await import(
    "./bestieScratchStore.ts"
  );
  const { BestieDmScratchSheet } = await import("./BestieDmScratchSheet.tsx");

  const scratchScope = scope("wss://relay.example/scratch-reader");
  const body = `${"Parked line.\n".repeat(8)}END`;
  addBestieScratchNoteForScope(scratchScope, {
    body,
    title: "Parked",
  });
  const note = getBestieScratchState(scratchScope).notes[0];

  try {
    render(
      React.createElement(BestieDmScratchSheet, {
        adding: false,
        scope: scratchScope,
      }),
    );
    fireEvent.click(
      screen.getByTestId(`bestie-large-text-open-${note.id}-fullscreen`),
    );
    const reader = screen.getByTestId("bestie-large-text-reader");
    assert.equal(reader.getAttribute("data-mode"), "fullscreen");
    assert.equal(
      screen.queryByTestId(`bestie-large-text-open-${note.id}-window`),
      null,
    );
    assert.equal(
      screen.queryByTestId(`bestie-scratch-editor-${note.id}`),
      null,
    );
    const field = screen.getByTestId("bestie-large-text-body");
    assert.equal(field.value, body);
    fireEvent.change(field, { target: { value: `${body}\nMore.` } });
    fireEvent.keyDown(window, { key: "Escape" });
    assert.equal(screen.queryByTestId("bestie-large-text-reader"), null);
    assert.equal(
      getBestieScratchState(scratchScope).notes[0].body,
      `${body}\nMore.`,
    );
    assert.equal(getBestieScratchState(scratchScope).notes[0].draft, true);
    assert.equal(
      screen.queryByTestId(`bestie-scratch-editor-${note.id}`),
      null,
    );
  } finally {
    cleanup();
  }
});

function macPrimaryKey(extra = {}) {
  Object.defineProperty(globalThis.navigator, "platform", {
    configurable: true,
    get: () => "MacIntel",
  });
  return { key: "Enter", metaKey: true, ...extra };
}

function ScratchHarness({
  React,
  BestieDmScratchSheet,
  initialAdding,
  onRequestAdd,
  scope,
}) {
  const [adding, setAdding] = React.useState(initialAdding);
  return React.createElement(BestieDmScratchSheet, {
    adding,
    onAdded: () => setAdding(false),
    onRequestAdd: () => {
      onRequestAdd?.();
      setAdding(true);
    },
    scope,
  });
}

test("command+enter opens a new fullscreen scratch note", async () => {
  const React = await import("react");
  const { cleanup, fireEvent, render, screen } = await import(
    "@testing-library/react"
  );
  const { getBestieScratchState } = await import("./bestieScratchStore.ts");
  const { BestieDmScratchSheet } = await import("./BestieDmScratchSheet.tsx");
  const scratchScope = scope("wss://relay.example/scratch-new-hotkey");
  let requests = 0;

  try {
    render(
      React.createElement(ScratchHarness, {
        BestieDmScratchSheet,
        React,
        onRequestAdd: () => {
          requests += 1;
        },
        scope: scratchScope,
      }),
    );
    fireEvent.keyDown(window, macPrimaryKey({ ctrlKey: true }));
    fireEvent.keyDown(window, macPrimaryKey({ shiftKey: true }));
    assert.equal(requests, 0);
    assert.equal(screen.queryByTestId("bestie-large-text-reader"), null);
    fireEvent.keyDown(window, macPrimaryKey());
    assert.equal(requests, 1);
    assert.equal(
      screen.getByTestId("bestie-large-text-reader").getAttribute("data-mode"),
      "fullscreen",
    );
    assert.ok(screen.getByTestId("bestie-large-text-title-input"));
    assert.equal(
      screen.getByText("⌘⇧↩ saves and closes").textContent,
      "⌘⇧↩ saves and closes",
    );
    assert.equal(getBestieScratchState(scratchScope).notes.length, 0);
  } finally {
    cleanup();
  }
});

test("command+shift+enter saves one new note and an empty pad writes nothing", async () => {
  const React = await import("react");
  const { cleanup, fireEvent, render, screen } = await import(
    "@testing-library/react"
  );
  const { getBestieScratchState } = await import("./bestieScratchStore.ts");
  const { BestieDmScratchSheet } = await import("./BestieDmScratchSheet.tsx");
  const scratchScope = scope("wss://relay.example/scratch-save-hotkey");

  try {
    const view = render(
      React.createElement(ScratchHarness, {
        BestieDmScratchSheet,
        React,
        scope: scratchScope,
      }),
    );
    fireEvent.keyDown(window, macPrimaryKey());
    fireEvent.change(screen.getByTestId("bestie-large-text-body"), {
      target: { value: "Remember the gate." },
    });
    fireEvent.keyDown(window, macPrimaryKey({ shiftKey: true }));
    const saved = getBestieScratchState(scratchScope).notes;
    assert.equal(saved.length, 1);
    assert.equal(saved[0].body, "Remember the gate.");
    assert.equal(saved[0].title, "Remember the gate.");
    assert.equal(saved[0].draft, false);
    assert.equal(screen.queryByTestId("bestie-large-text-reader"), null);
    assert.equal(screen.queryByTestId("bestie-add-scratch"), null);

    fireEvent.keyDown(window, macPrimaryKey());
    assert.ok(screen.getByTestId("bestie-large-text-reader"));
    fireEvent.keyDown(window, macPrimaryKey({ shiftKey: true }));
    assert.equal(getBestieScratchState(scratchScope).notes.length, 1);
    assert.equal(screen.queryByTestId("bestie-large-text-reader"), null);
    assert.equal(screen.queryByTestId("bestie-add-scratch"), null);
    view.unmount();
  } finally {
    cleanup();
  }
});

test("command+shift+enter saves the small new-note form", async () => {
  const React = await import("react");
  const { cleanup, fireEvent, render, screen } = await import(
    "@testing-library/react"
  );
  const { getBestieScratchState } = await import("./bestieScratchStore.ts");
  const { BestieDmScratchSheet } = await import("./BestieDmScratchSheet.tsx");
  const scratchScope = scope("wss://relay.example/scratch-small-form-save");

  try {
    const view = render(
      React.createElement(ScratchHarness, {
        BestieDmScratchSheet,
        React,
        initialAdding: true,
        scope: scratchScope,
      }),
    );
    fireEvent.change(
      view.getByTestId("bestie-add-scratch").querySelector("textarea"),
      {
        target: { value: "Small form note." },
      },
    );
    fireEvent.keyDown(window, macPrimaryKey({ shiftKey: true }));
    const notes = getBestieScratchState(scratchScope).notes;
    assert.equal(notes.length, 1);
    assert.equal(notes[0].body, "Small form note.");
    assert.equal(screen.queryByTestId("bestie-add-scratch"), null);
    assert.equal(screen.queryByTestId("bestie-large-text-reader"), null);
  } finally {
    cleanup();
  }
});

test("the open note and the new-note form both open fullscreen", async () => {
  const React = await import("react");
  const { cleanup, fireEvent, render, screen } = await import(
    "@testing-library/react"
  );
  const { addBestieScratchNoteForScope, getBestieScratchState } = await import(
    "./bestieScratchStore.ts"
  );
  const { BestieDmScratchSheet } = await import("./BestieDmScratchSheet.tsx");
  const scratchScope = scope("wss://relay.example/scratch-fullscreen-controls");
  addBestieScratchNoteForScope(scratchScope, {
    body: "Parked line.",
    title: "Parked",
  });
  const note = getBestieScratchState(scratchScope).notes[0];

  try {
    const view = render(
      React.createElement(ScratchHarness, {
        BestieDmScratchSheet,
        React,
        initialAdding: true,
        scope: scratchScope,
      }),
    );
    const draft = view.getByTestId("bestie-large-text-open-draft-fullscreen");
    const form = view.getByTestId("bestie-add-scratch");
    fireEvent.change(form.querySelector("textarea"), {
      target: { value: "Typed before fullscreen." },
    });
    fireEvent.click(draft);
    assert.equal(
      screen.getByTestId("bestie-large-text-body").value,
      "Typed before fullscreen.",
    );
    fireEvent.keyDown(window, macPrimaryKey({ shiftKey: true }));
    const notes = getBestieScratchState(scratchScope).notes;
    assert.equal(notes.length, 2);
    assert.equal(notes[0].body, "Typed before fullscreen.");
    assert.equal(screen.queryByTestId("bestie-large-text-reader"), null);

    fireEvent.click(screen.getByTestId(`bestie-scratch-open-${note.id}`));
    assert.ok(screen.getByTestId(`bestie-scratch-editor-${note.id}`));
    fireEvent.click(
      screen.getByTestId(`bestie-large-text-open-${note.id}-fullscreen`),
    );
    const field = screen.getByTestId("bestie-large-text-body");
    assert.equal(field.value, "Parked line.");
    fireEvent.change(field, { target: { value: "Parked line.\nMore." } });
    fireEvent.keyDown(window, macPrimaryKey({ shiftKey: true }));
    assert.equal(screen.queryByTestId("bestie-large-text-reader"), null);
    assert.equal(
      screen.queryByTestId(`bestie-scratch-editor-${note.id}`),
      null,
    );
    const updated = getBestieScratchState(scratchScope).notes.find(
      (entry) => entry.id === note.id,
    );
    assert.equal(updated.body, "Parked line.\nMore.");
  } finally {
    cleanup();
  }
});

test("command+enter does not start a second note while one is open", async () => {
  const React = await import("react");
  const { cleanup, fireEvent, render, screen } = await import(
    "@testing-library/react"
  );
  const { addBestieScratchNoteForScope, getBestieScratchState } = await import(
    "./bestieScratchStore.ts"
  );
  const { BestieDmScratchSheet } = await import("./BestieDmScratchSheet.tsx");
  const scratchScope = scope("wss://relay.example/scratch-no-second");
  addBestieScratchNoteForScope(scratchScope, {
    body: "Stay here.",
    title: "Open",
  });
  const note = getBestieScratchState(scratchScope).notes[0];
  let requests = 0;

  try {
    render(
      React.createElement(ScratchHarness, {
        BestieDmScratchSheet,
        React,
        onRequestAdd: () => {
          requests += 1;
        },
        scope: scratchScope,
      }),
    );
    fireEvent.click(screen.getByTestId(`bestie-scratch-open-${note.id}`));
    fireEvent.keyDown(window, macPrimaryKey());
    assert.equal(requests, 0);
    assert.ok(screen.getByTestId(`bestie-scratch-editor-${note.id}`));
    assert.equal(screen.queryByTestId("bestie-large-text-reader"), null);
    fireEvent.keyDown(window, macPrimaryKey({ shiftKey: true }));
    assert.equal(getBestieScratchState(scratchScope).notes.length, 1);
    assert.equal(
      screen.queryByTestId(`bestie-scratch-editor-${note.id}`),
      null,
    );
  } finally {
    cleanup();
  }
});

test("clicking outside a scratch note saves a Draft and drafts delete in one click", async () => {
  const React = await import("react");
  const { cleanup, fireEvent, render, screen } = await import(
    "@testing-library/react"
  );
  const { addBestieScratchNoteForScope, getBestieScratchState } = await import(
    "./bestieScratchStore.ts"
  );
  const { BestieDmScratchSheet } = await import("./BestieDmScratchSheet.tsx");
  const scratchScope = scope("wss://relay.example/scratch-draft-dismiss");
  addBestieScratchNoteForScope(scratchScope, {
    body: "Keep this.",
    title: "Saved",
  });
  const saved = getBestieScratchState(scratchScope).notes[0];

  try {
    render(
      React.createElement(ScratchHarness, {
        BestieDmScratchSheet,
        React,
        scope: scratchScope,
      }),
    );
    fireEvent.click(
      screen.getByTestId(`bestie-large-text-open-${saved.id}-fullscreen`),
    );
    fireEvent.click(screen.getByTestId("bestie-large-text-backdrop"));
    assert.equal(screen.queryByTestId("bestie-large-text-reader"), null);
    assert.equal(getBestieScratchState(scratchScope).notes[0].draft, false);
    assert.equal(
      screen.queryByTestId(`bestie-scratch-draft-${saved.id}`),
      null,
    );

    fireEvent.keyDown(window, macPrimaryKey());
    fireEvent.change(screen.getByTestId("bestie-large-text-body"), {
      target: { value: "Hold this thought." },
    });
    fireEvent.click(screen.getByTestId("bestie-large-text-backdrop"));
    const notes = getBestieScratchState(scratchScope).notes;
    assert.equal(notes.length, 2);
    assert.equal(notes[0].draft, true);
    assert.equal(notes[0].body, "Hold this thought.");
    assert.ok(screen.getByTestId(`bestie-scratch-draft-${notes[0].id}`));
    assert.equal(screen.queryByTestId("bestie-add-scratch"), null);

    const draftRemove = screen.getByTestId(
      `bestie-scratch-remove-${notes[0].id}`,
    );
    fireEvent.click(draftRemove);
    assert.equal(
      getBestieScratchState(scratchScope).notes.some(
        (note) => note.id === notes[0].id,
      ),
      false,
    );

    const savedRemove = screen.getByTestId(`bestie-scratch-remove-${saved.id}`);
    fireEvent.click(savedRemove);
    assert.equal(savedRemove.getAttribute("data-confirming"), "true");
    assert.equal(
      savedRemove.getAttribute("aria-label"),
      "Confirm delete scratch note",
    );
    assert.equal(
      getBestieScratchState(scratchScope).notes.some(
        (note) => note.id === saved.id,
      ),
      true,
    );
    fireEvent.mouseDown(document.body);
    assert.equal(savedRemove.getAttribute("data-confirming"), "false");
    fireEvent.click(savedRemove);
    fireEvent.click(savedRemove);
    assert.equal(getBestieScratchState(scratchScope).notes.length, 0);
  } finally {
    cleanup();
  }
});

test("outside clicks on the reader do not count as leaving the popover", async () => {
  const { bestiePopoverShouldIgnoreOutside } = await import(
    "./bestieLargeTextTarget.ts"
  );
  const root = document.createElement("div");
  root.setAttribute("data-bestie-large-text-root", "");
  const child = document.createElement("p");
  child.textContent = "briefing";
  root.append(child);
  document.body.append(root);
  const outside = document.createElement("button");
  document.body.append(outside);

  assert.equal(bestiePopoverShouldIgnoreOutside(child), true);
  assert.equal(bestiePopoverShouldIgnoreOutside(root), true);
  assert.equal(bestiePopoverShouldIgnoreOutside(outside), false);
  assert.equal(bestiePopoverShouldIgnoreOutside(null), false);

  root.remove();
  outside.remove();
});
