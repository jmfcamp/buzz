import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test } from "node:test";

import { JSDOM } from "jsdom";
import {
  openTerminalPanel,
  setTerminalPanelMode,
} from "./terminalPanelStore.ts";

// `pretendToBeVisual` is what gives jsdom requestAnimationFrame. The banner's
// animation loop needs it; without it the loop silently never runs and every
// paint assertion below reads as a rendering failure.
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "http://localhost",
});
const callbacks = new Map();
const calls = [];
let nextCallback = 1;
let channel;
let resizeCallback;
let canvasWidth = 840;
let attachResolver = null;
let deferResizes = false;
let deferClose = false;
let closeResolver = null;
const pendingResizes = [];

before(async () => {
  Object.assign(globalThis, {
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    HTMLCanvasElement: dom.window.HTMLCanvasElement,
    KeyboardEvent: dom.window.KeyboardEvent,
    IS_REACT_ACT_ENVIRONMENT: true,
    isTauri: true,
    window: dom.window,
  });
  dom.window.localStorage.setItem("buzz-follow-system", "false");
  dom.window.isTauri = true;
  dom.window.matchMedia = () => ({
    // This suite exercises bootstrap/IPC behavior, not banner motion. Keeping
    // animation disabled avoids competing perpetual rAF loops under the full
    // parallel test runner; motion itself is covered by TerminalSubstrate.
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  });
  dom.window.ResizeObserver = class {
    constructor(callback) {
      resizeCallback = callback;
    }
    observe() {}
    disconnect() {}
  };
  dom.window.HTMLElement.prototype.animate = () => ({
    cancel() {},
    currentTime: 0,
    finished: new Promise(() => {}),
    play() {},
    playbackRate: 1,
    reverse() {},
  });
  dom.window.HTMLCanvasElement.prototype.getBoundingClientRect = () => ({
    bottom: 408,
    height: 408,
    left: 0,
    right: canvasWidth,
    top: 0,
    width: canvasWidth,
    x: 0,
    y: 0,
    toJSON() {},
  });
  dom.window.HTMLCanvasElement.prototype.getContext = () => ({
    clearRect() {},
    fillRect() {},
    fillStyle: "",
    fillText() {},
    font: "",
    restore() {},
    save() {},
    setTransform() {},
    textBaseline: "",
  });
  dom.window.__TAURI_INTERNALS__ = {
    invoke(command, args) {
      calls.push({ command, args });
      if (command === "terminal_attach") {
        channel = args.onFrame;
        const sessionNumber = calls.filter(
          ({ command }) => command === "terminal_attach",
        ).length;
        const response = {
          sessionId: `session-${sessionNumber}`,
          subscriptionId: `subscription-${sessionNumber}`,
          viewport: { columns: 100, generation: 0, screenLines: 24 },
        };
        return attachResolver
          ? new Promise((resolve) => {
              attachResolver = () => resolve(response);
            })
          : Promise.resolve(response);
      }
      if (command === "terminal_resize") {
        const value = {
          columns: args.columns,
          generation: args.columns,
          screenLines: args.rows,
        };
        if (!deferResizes) return Promise.resolve(value);
        return new Promise((resolve) => {
          pendingResizes.push(() => resolve(value));
        });
      }
      if (command === "terminal_close" && deferClose) {
        return new Promise((resolve) => {
          closeResolver = resolve;
        });
      }
      if (command === "term_herdr_available") {
        return Promise.resolve(true);
      }
      if (command === "term_open_in_herdr") {
        return Promise.resolve({
          ok: true,
          herdrBin: "/mock/herdr",
          sessionName: "buzz",
          attachArgv: ["session", "attach", "buzz"],
        });
      }
      return Promise.resolve();
    },
    transformCallback(callback) {
      const id = nextCallback++;
      callbacks.set(id, callback);
      return id;
    },
    unregisterCallback(id) {
      callbacks.delete(id);
    },
  };
});

after(() => dom.window.close());
beforeEach(() => setTerminalPanelMode("docked"));
afterEach(async () => {
  const { cleanup } = await import("@testing-library/react");
  cleanup();
  setTerminalPanelMode("closed");
  calls.length = 0;
  canvasWidth = 840;
  attachResolver = null;
  deferResizes = false;
  deferClose = false;
  closeResolver = null;
  pendingResizes.length = 0;
});

function emit(message, index = 0) {
  const id = Number(channel.toJSON().slice("__CHANNEL__:".length));
  callbacks.get(id)({ index, message });
}

test("mounted bootstrap passes GUI context and ACKs only after consuming a frame", async () => {
  const { StrictMode, createElement } = await import("react");
  const { act, render, waitFor } = await import("@testing-library/react");
  const { ThemeProvider } = await import("@/shared/theme/ThemeProvider");
  const { TerminalBootstrap } = await import("./TerminalBootstrap.tsx");

  const view = render(
    createElement(
      StrictMode,
      null,
      createElement(
        ThemeProvider,
        null,
        createElement("div", {
          className: "buzz-huddle-app-surface",
          tabIndex: -1,
        }),
        createElement(TerminalBootstrap, {
          channelId: "channel-1",
          channelName: "general",
          npub: "npub1owner",
          relayUrl: "wss://relay.example",
          threadId: "thread-1",
        }),
      ),
    ),
  );

  await waitFor(() =>
    assert.ok(calls.some(({ command }) => command === "terminal_attach")),
  );
  const attach = calls.find(({ command }) => command === "terminal_attach");
  assert.deepEqual(attach.args.request, {
    channelId: "channel-1",
    channelName: "general",
    columns: 100,
    npub: "npub1owner",
    pixelHeight: 408,
    pixelWidth: 840,
    relayUrl: "wss://relay.example",
    rows: 24,
    scrollback: 10000,
    threadId: "thread-1",
  });

  const sessionNumber = calls.filter(
    ({ command }) => command === "terminal_attach",
  ).length;
  const frameMessage = {
    type: "frame",
    payload: {
      bracketedPaste: true,
      cursor: { column: 0, line: 0, visible: true },
      focusReporting: true,
      full: true,
      rows: [],
      sequence: 7,
      subscriptionId: `subscription-${sessionNumber}`,
      viewport: { columns: 100, generation: 0, screenLines: 24 },
    },
  };
  await act(async () => {
    emit(frameMessage);
  });
  await waitFor(() =>
    assert.ok(calls.some(({ command }) => command === "terminal_ack")),
  );
  assert.deepEqual(
    calls.find(({ command }) => command === "terminal_ack").args,
    {
      sequence: 7,
      sessionId: `session-${sessionNumber}`,
      subscriptionId: `subscription-${sessionNumber}`,
    },
  );

  // IPC redelivery produces a newly deserialized object, so replay a distinct
  // object to exercise sequence-based deduplication rather than object identity.
  await act(async () => {
    emit(structuredClone(frameMessage), 1);
  });
  assert.equal(
    calls.filter(({ command }) => command === "terminal_ack").length,
    1,
  );
  view.unmount();
});

test("first-open splash waits for the first terminal frame", async () => {
  const { createElement } = await import("react");
  const { act, render, waitFor } = await import("@testing-library/react");
  const { ThemeProvider } = await import("@/shared/theme/ThemeProvider");
  const { TerminalBootstrap } = await import("./TerminalBootstrap.tsx");

  const view = render(
    createElement(
      ThemeProvider,
      null,
      createElement(TerminalBootstrap, {
        channelId: "channel-1",
        channelName: "general",
        npub: "npub1owner",
        relayUrl: "wss://relay.example",
        threadId: null,
      }),
    ),
  );
  await waitFor(() =>
    assert.ok(calls.some(({ command }) => command === "terminal_attach")),
  );
  assert.equal(
    view.container.querySelector(".buzz-terminal-welcome"),
    null,
    "the splash must not be consumed while the first PTY frame is pending",
  );

  await act(async () => {
    emit({
      type: "frame",
      payload: {
        bracketedPaste: false,
        cursor: { column: 0, line: 0, visible: true },
        focusReporting: false,
        full: true,
        rows: [],
        sequence: 1,
        subscriptionId: "subscription-1",
        viewport: { columns: 100, generation: 0, screenLines: 24 },
      },
    });
  });
  await waitFor(() =>
    assert.ok(view.container.querySelector(".buzz-terminal-welcome")),
  );
  view.unmount();
});

test("resize during in-flight catch-up keeps the newest viewport ready", async () => {
  const { createElement } = await import("react");
  const { act, render, waitFor } = await import("@testing-library/react");
  const { ThemeProvider } = await import("@/shared/theme/ThemeProvider");
  const { TerminalBootstrap } = await import("./TerminalBootstrap.tsx");

  attachResolver = () => {};
  deferResizes = true;
  const view = render(
    createElement(
      ThemeProvider,
      null,
      createElement("div", {
        className: "buzz-huddle-app-surface",
        tabIndex: -1,
      }),
      createElement(TerminalBootstrap, {
        channelId: "channel-1",
        channelName: "general",
        npub: "npub1owner",
        relayUrl: "wss://relay.example",
        threadId: null,
      }),
    ),
  );
  await waitFor(() => assert.equal(typeof attachResolver, "function"));

  canvasWidth = 1_008;
  act(() => resizeCallback());
  await act(async () => attachResolver());
  await waitFor(() => assert.equal(pendingResizes.length, 1));

  canvasWidth = 1_680;
  await act(async () => {
    resizeCallback();
  });

  // Resolve newest-first so an unchained catch-up resize would publish stale
  // readiness after the newer viewport.
  for (let i = 0; i < 10 && pendingResizes.length > 0; i += 1) {
    await act(async () => {
      pendingResizes.pop()();
      await Promise.resolve();
    });
  }
  await act(async () => {
    await Promise.resolve();
  });

  const readyCalls = calls.filter(
    ({ command }) => command === "terminal_viewport_ready",
  );
  assert.ok(readyCalls.length > 0, "vacuity guard: no readiness published");
  assert.equal(readyCalls.at(-1).args.viewport.columns, 200);
  view.unmount();
});

test("opening a tab keeps terminal ownership while its attachment is pending", async () => {
  const { createElement } = await import("react");
  const { act, fireEvent, render, waitFor } = await import(
    "@testing-library/react"
  );
  const { ThemeProvider } = await import("@/shared/theme/ThemeProvider");
  const { TerminalBootstrap } = await import("./TerminalBootstrap.tsx");

  const view = render(
    createElement(
      ThemeProvider,
      null,
      createElement("div", {
        className: "buzz-huddle-app-surface",
        tabIndex: -1,
      }),
      createElement(TerminalBootstrap, {
        channelId: "channel-1",
        channelName: "general",
        npub: "npub1owner",
        relayUrl: "wss://relay.example",
        threadId: null,
      }),
    ),
  );
  await waitFor(() =>
    assert.ok(calls.some(({ command }) => command === "terminal_attach")),
  );
  await act(async () => {
    await Promise.resolve();
  });
  const substrate = view.container.querySelector(".buzz-terminal-substrate");
  await waitFor(() =>
    assert.equal(substrate.dataset.terminalOwner, "terminal"),
  );

  attachResolver = () => {};
  fireEvent.click(view.getByLabelText("New Buzz Term tab"));
  await waitFor(() => assert.equal(typeof attachResolver, "function"));
  assert.equal(
    substrate.dataset.terminalOwner,
    "terminal",
    "an attaching session must not force the substrate back to Buzz",
  );
  assert.equal(view.getAllByRole("tab").length, 2);

  await act(async () => attachResolver());
  view.unmount();
});

test("channel scope shows only that channel and auto-creates on switch", async () => {
  const { createElement } = await import("react");
  const { act, render, waitFor } = await import("@testing-library/react");
  const { ThemeProvider } = await import("@/shared/theme/ThemeProvider");
  const { TerminalBootstrap } = await import("./TerminalBootstrap.tsx");
  const { openTerminalPanel, getTerminalPanelSnapshotForTests } = await import(
    "./terminalPanelStore.ts"
  );

  // In-channel open → channel scope.
  openTerminalPanel("docked", "channel");
  assert.equal(getTerminalPanelSnapshotForTests().tabScope, "channel");

  const props = (channelId, channelName) => ({
    channelId,
    channelName,
    npub: "npub1owner",
    relayUrl: "wss://relay.example",
    threadId: null,
  });
  const tree = (channelId, channelName) =>
    createElement(
      ThemeProvider,
      null,
      createElement(TerminalBootstrap, props(channelId, channelName)),
    );
  const view = render(tree("channel-a", "alpha"));
  await waitFor(() =>
    assert.ok(
      calls.some(
        ({ command, args }) =>
          command === "terminal_attach" &&
          args.request.channelId === "channel-a",
      ),
    ),
  );
  await waitFor(() =>
    assert.ok(view.queryByRole("tab", { name: /Terminal 1/ })),
  );

  view.rerender(tree("channel-b", "beta"));
  await waitFor(() =>
    assert.ok(
      calls.some(
        ({ command, args }) =>
          command === "terminal_attach" &&
          args.request.channelId === "channel-b",
      ),
    ),
  );
  // Channel-scoped strip: only beta's tab is listed (alpha stays live off-strip).
  await waitFor(() =>
    assert.ok(view.queryByRole("tab", { name: /Terminal 1/ })),
  );
  assert.equal(view.queryAllByRole("tab").length, 1);

  canvasWidth = 1_680;
  await act(async () => resizeCallback());
  await waitFor(() =>
    assert.ok(
      calls.some(
        ({ command, args }) =>
          command === "terminal_resize" &&
          args.sessionId === "session-2" &&
          args.columns === 200,
      ),
    ),
  );

  view.rerender(tree("channel-a", "alpha"));
  await waitFor(() =>
    assert.ok(
      calls.some(
        ({ command, args }) =>
          command === "terminal_resize" &&
          args.sessionId === "session-1" &&
          args.columns === 200,
      ),
    ),
  );
  assert.equal(view.queryAllByRole("tab").length, 1);
  view.unmount();
});

test("left-nav all scope shows every channel tab with provenance", async () => {
  const { createElement } = await import("react");
  const { act, render, waitFor } = await import("@testing-library/react");
  const { ThemeProvider } = await import("@/shared/theme/ThemeProvider");
  const { TerminalBootstrap } = await import("./TerminalBootstrap.tsx");
  const { openTerminalPanel, getTerminalPanelSnapshotForTests } = await import(
    "./terminalPanelStore.ts"
  );

  openTerminalPanel("docked", "channel");
  const props = (channelId, channelName) => ({
    channelId,
    channelName,
    npub: "npub1owner",
    relayUrl: "wss://relay.example",
    threadId: null,
  });
  const tree = (channelId, channelName) =>
    createElement(
      ThemeProvider,
      null,
      createElement(TerminalBootstrap, props(channelId, channelName)),
    );
  const view = render(tree("channel-a", "alpha"));
  await waitFor(() =>
    assert.ok(
      calls.some(
        ({ command, args }) =>
          command === "terminal_attach" &&
          args.request.channelId === "channel-a",
      ),
    ),
  );

  view.rerender(tree("channel-b", "beta"));
  await waitFor(() =>
    assert.ok(
      calls.some(
        ({ command, args }) =>
          command === "terminal_attach" &&
          args.request.channelId === "channel-b",
      ),
    ),
  );
  const attachesBeforeGlobal = calls.filter(
    ({ command }) => command === "terminal_attach",
  ).length;

  // Left-nav Buzz Term → global all tabs; must not spawn empty.
  act(() => openTerminalPanel("maximized", "all"));
  await waitFor(() =>
    assert.equal(getTerminalPanelSnapshotForTests().tabScope, "all"),
  );
  await waitFor(() => assert.equal(view.queryAllByRole("tab").length, 2));
  assert.ok(
    view.queryByRole("tab", { name: /alpha/ }),
    "global strip labels channel-a tab with channel name",
  );
  assert.ok(
    view.queryByRole("tab", { name: /beta/ }),
    "global strip labels channel-b tab with channel name",
  );
  assert.equal(
    calls.filter(({ command }) => command === "terminal_attach").length,
    attachesBeforeGlobal,
    "opening global view must not create a blank tab",
  );

  // Navigate away (null channel): global view keeps tabs.
  view.rerender(tree(null, null));
  await act(async () => {
    await Promise.resolve();
  });
  assert.equal(getTerminalPanelSnapshotForTests().mode, "maximized");
  assert.equal(view.queryAllByRole("tab").length, 2);
  view.unmount();
});

test("closing a tab while attach is pending closes the eventual session", async () => {
  const { createElement } = await import("react");
  const { act, fireEvent, render, waitFor } = await import(
    "@testing-library/react"
  );
  const { ThemeProvider } = await import("@/shared/theme/ThemeProvider");
  const { TerminalBootstrap } = await import("./TerminalBootstrap.tsx");

  attachResolver = () => {};
  const view = render(
    createElement(
      ThemeProvider,
      null,
      createElement(TerminalBootstrap, {
        channelId: "channel-1",
        channelName: "general",
        npub: "npub1owner",
        relayUrl: "wss://relay.example",
        threadId: null,
      }),
    ),
  );
  await waitFor(() => assert.equal(typeof attachResolver, "function"));
  await waitFor(() =>
    assert.ok(view.queryByRole("tab", { name: /Terminal 1/ })),
  );

  await act(async () => {
    fireEvent.click(view.getByLabelText("Close SHELL"));
    setTerminalPanelMode("closed");
  });
  await waitFor(() => assert.equal(view.queryByRole("tab"), null));
  assert.equal(
    calls.some(({ command }) => command === "terminal_close"),
    false,
    "a not-yet-attached session cannot be closed by backend id",
  );

  await act(async () => attachResolver());
  await waitFor(() =>
    assert.ok(
      calls.some(
        ({ command, args }) =>
          command === "terminal_close" && args.sessionId === "session-1",
      ),
    ),
  );
  view.unmount();
});

test("closing removes the tab before native shutdown resolves", async () => {
  const { createElement } = await import("react");
  const { fireEvent, render, waitFor } = await import("@testing-library/react");
  const { ThemeProvider } = await import("@/shared/theme/ThemeProvider");
  const { TerminalBootstrap } = await import("./TerminalBootstrap.tsx");

  const view = render(
    createElement(
      ThemeProvider,
      null,
      createElement("div", {
        className: "buzz-huddle-app-surface",
        tabIndex: -1,
      }),
      createElement(TerminalBootstrap, {
        channelId: "channel-1",
        channelName: "general",
        npub: "npub1owner",
        relayUrl: "wss://relay.example",
        threadId: null,
      }),
    ),
  );
  await waitFor(() =>
    assert.ok(calls.some(({ command }) => command === "terminal_attach")),
  );
  await waitFor(() =>
    assert.ok(view.queryByRole("tab", { name: /Terminal 1/ })),
  );

  deferClose = true;
  fireEvent.click(view.getByLabelText("Close SHELL"));

  await waitFor(() =>
    assert.ok(calls.some(({ command }) => command === "terminal_close")),
  );
  await waitFor(() => assert.equal(view.queryByRole("tab"), null));
  assert.equal(typeof closeResolver, "function");
  closeResolver();
  view.unmount();
});

// The wheel-to-IPC path end to end. `TerminalSubstrate` already proves it
// accumulates pixels into whole cells and `buzz-terminal` already proves which
// way the engine goes; the seam between them is this file's business, and the
// thing that can silently rot here is the *sign*. A negation added in the
// bridge would leave every unit test green and scroll the terminal the wrong
// way, so this asserts the delta reaches `terminal_scroll` unchanged: positive
// `deltaY` -- the gesture that scrolls a page toward the bottom of the
// document -- must arrive positive, and the backend owns the flip.
test("wheel deltas reach terminal_scroll with the DOM sign intact", async () => {
  const { createElement } = await import("react");
  const { act, fireEvent, render, waitFor } = await import(
    "@testing-library/react"
  );
  const { ThemeProvider } = await import("@/shared/theme/ThemeProvider");
  const { TerminalBootstrap } = await import("./TerminalBootstrap.tsx");

  const view = render(
    createElement(
      ThemeProvider,
      null,
      createElement("div", {
        className: "buzz-huddle-app-surface",
        tabIndex: -1,
      }),
      createElement(TerminalBootstrap, {
        channelId: "channel-1",
        channelName: "general",
        npub: "npub1owner",
        relayUrl: "wss://relay.example",
        threadId: null,
      }),
    ),
  );
  await waitFor(() =>
    assert.ok(calls.some(({ command }) => command === "terminal_attach")),
  );
  await act(async () => {
    await Promise.resolve();
  });
  const substrate = view.container.querySelector(".buzz-terminal-substrate");

  // Two cells' worth of pixels (cell height is 17), backwards.
  await act(async () => {
    fireEvent.wheel(substrate, { deltaMode: 0, deltaY: -34 });
  });
  const scrolls = () =>
    calls.filter(({ command }) => command === "terminal_scroll");
  await waitFor(() => assert.equal(scrolls().length, 1));
  assert.equal(
    scrolls()[0].args.lines,
    -2,
    "a backwards wheel must arrive negative; the backend owns the negation",
  );
  assert.equal(scrolls()[0].args.sessionId, "session-1");

  await act(async () => {
    fireEvent.wheel(substrate, { deltaMode: 0, deltaY: 34 });
  });
  await waitFor(() => assert.equal(scrolls().length, 2));
  assert.equal(scrolls()[1].args.lines, 2, "and forwards must arrive positive");

  view.unmount();
});

test("channel scope with null context does not list foreign tabs", async () => {
  const { createElement } = await import("react");
  const { act, render, waitFor } = await import("@testing-library/react");
  const { ThemeProvider } = await import("@/shared/theme/ThemeProvider");
  const { TerminalBootstrap } = await import("./TerminalBootstrap.tsx");
  const { openTerminalPanel, getTerminalPanelSnapshotForTests } = await import(
    "./terminalPanelStore.ts"
  );

  openTerminalPanel("docked", "channel");
  const props = (channelId) => ({
    channelId,
    channelName: channelId ? "alpha" : null,
    npub: "npub1owner",
    relayUrl: "wss://relay.example",
    threadId: null,
  });
  const tree = (channelId) =>
    createElement(
      ThemeProvider,
      null,
      createElement(TerminalBootstrap, props(channelId)),
    );
  const view = render(tree("channel-a"));
  await waitFor(() =>
    assert.ok(calls.some(({ command }) => command === "terminal_attach")),
  );
  await waitFor(() =>
    assert.ok(view.queryByRole("tab", { name: /Terminal 1/ })),
  );

  view.rerender(tree(null));
  await act(async () => {
    await Promise.resolve();
  });
  // Channel scope + no active channel → empty strip; PTYs stay alive in state.
  assert.equal(getTerminalPanelSnapshotForTests().mode, "docked");
  assert.equal(view.queryByRole("tab"), null);
  assert.equal(
    calls.filter(({ command }) => command === "terminal_attach").length,
    1,
  );
  view.unmount();
});

test("left-nav maximize with no sessions opens empty global panel", async () => {
  const { createElement } = await import("react");
  const { act, render, waitFor } = await import("@testing-library/react");
  const { ThemeProvider } = await import("@/shared/theme/ThemeProvider");
  const { TerminalBootstrap } = await import("./TerminalBootstrap.tsx");
  const { getTerminalPanelSnapshotForTests } = await import(
    "./terminalPanelStore.ts"
  );

  setTerminalPanelMode("closed");
  const view = render(
    createElement(
      ThemeProvider,
      null,
      createElement(TerminalBootstrap, {
        channelId: null,
        channelName: null,
        npub: "npub1owner",
        relayUrl: "wss://relay.example",
        threadId: null,
      }),
    ),
  );
  act(() => openTerminalPanel("maximized", "all"));
  await waitFor(() =>
    assert.equal(getTerminalPanelSnapshotForTests().mode, "maximized"),
  );
  assert.equal(getTerminalPanelSnapshotForTests().tabScope, "all");
  assert.equal(
    calls.filter(({ command }) => command === "terminal_attach").length,
    0,
    "must not invent a channel to spawn a blank PTY",
  );
  assert.equal(view.queryByRole("tab"), null);
  view.unmount();
});

test("left-nav maximized+all with channel context creates in-app session when host is buzz-term", async () => {
  const { createElement } = await import("react");
  const { act, render, waitFor } = await import("@testing-library/react");
  const { ThemeProvider } = await import("@/shared/theme/ThemeProvider");
  const { TerminalBootstrap } = await import("./TerminalBootstrap.tsx");
  const { getTerminalPanelSnapshotForTests } = await import(
    "./terminalPanelStore.ts"
  );
  const { setTermSessionHost } = await import("./termPreferences.ts");

  setTermSessionHost("buzz-term");
  setTerminalPanelMode("closed");
  const view = render(
    createElement(
      ThemeProvider,
      null,
      createElement(TerminalBootstrap, {
        channelId: "channel-1",
        channelName: "general",
        npub: "npub1owner",
        relayUrl: "wss://relay.example",
        threadId: null,
      }),
    ),
  );

  // Panel starts closed — no auto-create yet.
  assert.equal(
    calls.filter(({ command }) => command === "terminal_attach").length,
    0,
  );

  act(() => openTerminalPanel("maximized", "all"));
  await waitFor(() =>
    assert.equal(getTerminalPanelSnapshotForTests().mode, "maximized"),
  );
  assert.equal(getTerminalPanelSnapshotForTests().tabScope, "all");

  await waitFor(() =>
    assert.ok(
      calls.some(({ command }) => command === "terminal_attach"),
      "must create an in-app PTY — never leave empty maximized chrome",
    ),
  );
  await waitFor(() =>
    assert.ok(view.queryByRole("tab", { name: /Terminal 1|general/ })),
  );
  assert.equal(
    calls.filter(({ command }) => command === "terminal_attach").length,
    1,
  );
  view.unmount();
});

test("herdr host left-nav maximized+all with channel context creates herdr attach", async () => {
  const { createElement } = await import("react");
  const { act, render, waitFor } = await import("@testing-library/react");
  const { ThemeProvider } = await import("@/shared/theme/ThemeProvider");
  const { TerminalBootstrap } = await import("./TerminalBootstrap.tsx");
  const { getTerminalPanelSnapshotForTests } = await import(
    "./terminalPanelStore.ts"
  );
  const { setTermSessionHost, resetTermPreferencesForTests } = await import(
    "./termPreferences.ts"
  );

  resetTermPreferencesForTests();
  setTermSessionHost("herdr");
  setTerminalPanelMode("closed");
  const view = render(
    createElement(
      ThemeProvider,
      null,
      createElement(TerminalBootstrap, {
        channelId: "channel-1",
        channelName: "general",
        npub: "npub1owner",
        relayUrl: "wss://relay.example",
        threadId: null,
      }),
    ),
  );

  act(() => openTerminalPanel("maximized", "all"));
  await waitFor(() =>
    assert.equal(getTerminalPanelSnapshotForTests().mode, "maximized"),
  );

  await waitFor(() =>
    assert.ok(
      calls.some(
        ({ command, args }) =>
          command === "terminal_attach" &&
          args.request.program === "/mock/herdr" &&
          Array.isArray(args.request.args) &&
          args.request.args.join(" ") === "session attach buzz",
      ),
      "must spawn in-app herdr session attach — not leave maximized chrome blank",
    ),
  );
  assert.ok(
    calls.some(({ command }) => command === "term_open_in_herdr"),
    "plain open probes herdr (no workspace create required by mock)",
  );
  const openCall = calls.find(
    ({ command }) => command === "term_open_in_herdr",
  );
  assert.equal(openCall.args.request.createWorkspace, false);
  await waitFor(() =>
    assert.ok(view.queryByRole("tab", { name: /herdr|general/i })),
  );
  view.unmount();
  resetTermPreferencesForTests();
});

test("herdr host cold left-nav without channel still creates herdr attach", async () => {
  const { createElement } = await import("react");
  const { act, render, waitFor } = await import("@testing-library/react");
  const { ThemeProvider } = await import("@/shared/theme/ThemeProvider");
  const { TerminalBootstrap } = await import("./TerminalBootstrap.tsx");
  const { getTerminalPanelSnapshotForTests } = await import(
    "./terminalPanelStore.ts"
  );
  const { setTermSessionHost, resetTermPreferencesForTests } = await import(
    "./termPreferences.ts"
  );

  resetTermPreferencesForTests();
  setTermSessionHost("herdr");
  setTerminalPanelMode("closed");
  const view = render(
    createElement(
      ThemeProvider,
      null,
      createElement(TerminalBootstrap, {
        channelId: null,
        channelName: null,
        npub: "npub1owner",
        relayUrl: "wss://relay.example",
        threadId: null,
      }),
    ),
  );

  act(() => openTerminalPanel("maximized", "all"));
  await waitFor(() =>
    assert.equal(getTerminalPanelSnapshotForTests().tabScope, "all"),
  );

  await waitFor(() =>
    assert.ok(
      calls.some(
        ({ command, args }) =>
          command === "terminal_attach" &&
          args.request.program === "/mock/herdr",
      ),
      "cold left-nav with identity must still spawn herdr attach",
    ),
  );
  assert.ok(
    calls.some(
      ({ command, args }) =>
        command === "terminal_attach" &&
        args.request.channelId === "__buzz_term__",
    ),
  );
  view.unmount();
  resetTermPreferencesForTests();
});
