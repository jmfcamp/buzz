/**
 * Chrome tabs in the top row. Home restores the normal layout. Add as Tab
 * on a real Inbox row opens that surface and collapses the left panel.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { JSDOM } from "jsdom";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/app/navigation/useAppNavigation") {
      return { shortCircuit: true, url: "buzz-tab-stub:navigation" };
    }
    if (specifier === "@tauri-apps/api/window") {
      return { shortCircuit: true, url: "buzz-tab-stub:tauri-window" };
    }
    if (specifier === "@/features/pinned-sites/hooks") {
      return { shortCircuit: true, url: "buzz-tab-stub:pins" };
    }
    if (specifier === "@/features/sidebar/lib/useSidebarMenuCounts") {
      return { shortCircuit: true, url: "buzz-tab-stub:menu-counts" };
    }
    if (specifier === "@/features/sidebar/lib/useActiveWorkingChannelsById") {
      return { shortCircuit: true, url: "buzz-tab-stub:working" };
    }
    // These modules import the channel directory cycle. The Inbox row does
    // not render them. Leave that cycle alone.
    if (specifier === "@protected-feature-components") {
      return { shortCircuit: true, url: "buzz-tab-stub:protected" };
    }
    if (specifier === "@/features/sidebar/ui/SidebarProjectsSection") {
      return { shortCircuit: true, url: "buzz-tab-stub:projects-section" };
    }
    if (specifier === "@/features/search/ui/TopbarSearch") {
      return { shortCircuit: true, url: "buzz-tab-stub:topbar-search" };
    }
    if (
      specifier === "./useBestie" &&
      context.parentURL?.includes("BestieSidebarEntry")
    ) {
      return { shortCircuit: true, url: "buzz-tab-stub:bestie" };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === "buzz-tab-stub:navigation") {
      return {
        format: "module",
        shortCircuit: true,
        source: `
          function record(name) {
            return (...args) => {
              globalThis.__surfaceTabNav.push([name, ...args]);
              return Promise.resolve();
            };
          }
          export function useAppNavigation() {
            return {
              goHome: record("goHome"),
              goPulse: record("goPulse"),
              goProjects: record("goProjects"),
              goProject: record("goProject"),
              goAgents: record("goAgents"),
              goBots: record("goBots"),
              goBrowsers: record("goBrowsers"),
              goWorkflows: record("goWorkflows"),
              goPinnedSite: record("goPinnedSite"),
              goChannel: record("goChannel"),
            };
          }
        `,
      };
    }
    if (url === "buzz-tab-stub:tauri-window") {
      return {
        format: "module",
        shortCircuit: true,
        source: `
          export const UserAttentionType = {};
          export function getCurrentWindow() {
            return {
              label: "main",
              isFullscreen: async () => false,
              onResized: async () => () => {},
            };
          }
        `,
      };
    }
    if (url === "buzz-tab-stub:pins") {
      return {
        format: "module",
        shortCircuit: true,
        source: "export function usePinnedSites() { return { pins: [] }; }\n",
      };
    }
    if (url === "buzz-tab-stub:menu-counts") {
      return {
        format: "module",
        shortCircuit: true,
        source: `
          export function useSidebarMenuCounts() {
            return globalThis.__surfaceTabMenuCounts ?? {
              preferences: { inbox: false, agents: false, bots: false, browsers: false },
              counts: { inbox: 0, agents: "0/0", browsers: 0, bots: 0 },
            };
          }
        `,
      };
    }
    if (url === "buzz-tab-stub:working") {
      return {
        format: "module",
        shortCircuit: true,
        source: `
          const EMPTY_WORKING = new Map();
          export function useActiveWorkingChannelsById() {
            return globalThis.__surfaceTabWorking ?? EMPTY_WORKING;
          }
        `,
      };
    }
    if (url === "buzz-tab-stub:protected") {
      return {
        format: "module",
        shortCircuit: true,
        source:
          "export function ProtectedBestieSidebarEntry() { return null; }\n",
      };
    }
    if (url === "buzz-tab-stub:projects-section") {
      return {
        format: "module",
        shortCircuit: true,
        source: "export function SidebarProjectsSection() { return null; }\n",
      };
    }
    if (url === "buzz-tab-stub:topbar-search") {
      return {
        format: "module",
        shortCircuit: true,
        source: "export function TopbarSearch() { return null; }\n",
      };
    }
    if (url === "buzz-tab-stub:bestie") {
      return {
        format: "module",
        shortCircuit: true,
        source: `
          export function useBestie() {
            return {
              assignedAgent: null,
              isOpening: false,
              openConversation: async () => {},
            };
          }
        `,
      };
    }
    return nextLoad(url, context);
  },
});

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost",
});

const FOLLOWING = dom.window.Node.DOCUMENT_POSITION_FOLLOWING;

before(() => {
  globalThis.__surfaceTabNav = [];
  globalThis.__surfaceTabRowClicks = [];
  Object.assign(globalThis, {
    document: dom.window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
    MutationObserver: dom.window.MutationObserver,
    localStorage: dom.window.localStorage,
    self: dom.window,
    window: dom.window,
  });
  for (const key of Object.getOwnPropertyNames(dom.window)) {
    if (
      !(key in globalThis) &&
      (key.startsWith("HTML") ||
        key.startsWith("SVG") ||
        key.startsWith("CSS") ||
        [
          "DOMRect",
          "DOMRectReadOnly",
          "Element",
          "Node",
          "NodeFilter",
          "NodeList",
          "NamedNodeMap",
          "Event",
          "CustomEvent",
          "MouseEvent",
          "KeyboardEvent",
          "FocusEvent",
          "InputEvent",
          "PointerEvent",
          "TouchEvent",
          "WheelEvent",
          "EventTarget",
          "Text",
          "Comment",
          "DocumentFragment",
          "Range",
          "Selection",
        ].includes(key))
    ) {
      const value = dom.window[key];
      if (value !== undefined) globalThis[key] = value;
    }
  }
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  dom.window.ResizeObserver = globalThis.ResizeObserver;
  for (const key of [
    "Event",
    "CustomEvent",
    "MouseEvent",
    "KeyboardEvent",
    "PointerEvent",
    "FocusEvent",
    "WheelEvent",
    "EventTarget",
    "DOMRect",
    "DOMRectReadOnly",
  ]) {
    if (dom.window[key]) globalThis[key] = dom.window[key];
  }
  globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
  Object.defineProperty(dom.window.navigator, "platform", {
    configurable: true,
    get: () => "MacIntel",
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: dom.window.navigator,
  });
  dom.window.matchMedia = () => ({
    matches: false,
    media: "",
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent() {
      return false;
    },
  });
  globalThis.matchMedia = dom.window.matchMedia;
  dom.window.requestAnimationFrame = (callback) => setTimeout(callback, 0);
  dom.window.cancelAnimationFrame = (id) => clearTimeout(id);
  globalThis.requestAnimationFrame = dom.window.requestAnimationFrame;
  globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame;
  const elementProto = dom.window.Element.prototype;
  if (!elementProto.scrollIntoView) elementProto.scrollIntoView = () => {};
  if (!elementProto.hasPointerCapture) {
    elementProto.hasPointerCapture = () => false;
  }
  if (!elementProto.setPointerCapture)
    elementProto.setPointerCapture = () => {};
  if (!elementProto.releasePointerCapture) {
    elementProto.releasePointerCapture = () => {};
  }
  // Radix layer coordination dispatches plain objects. JSDOM rejects them.
  const dispatchEvent = dom.window.EventTarget.prototype.dispatchEvent;
  dom.window.EventTarget.prototype.dispatchEvent = function patched(event) {
    if (!(event instanceof dom.window.Event)) return false;
    return dispatchEvent.call(this, event);
  };
});

after(() => {
  dom.window.close();
});

beforeEach(() => {
  dom.window.localStorage.clear();
  globalThis.__surfaceTabNav = [];
  globalThis.__surfaceTabRowClicks = [];
  globalThis.__surfaceTabMenuCounts = undefined;
  globalThis.__surfaceTabWorking = undefined;
});

afterEach(async () => {
  const { cleanup } = await import("@testing-library/react");
  cleanup();
  const { setTerminalPanelMode } = await import(
    "@/features/terminal/terminalPanelStore.ts"
  );
  setTerminalPanelMode("closed");
});

async function loadUi() {
  const React = await import("react");
  const testing = await import("@testing-library/react");
  const { AppShellProvider } = await import("@/app/AppShellContext.tsx");
  const { AppTopChrome } = await import("@/app/AppTopChrome.tsx");
  const { SurfaceTabsProvider, useSurfaceTabs } = await import(
    "./SurfaceTabsProvider.tsx"
  );
  const { AppSidebarPrimaryMenu } = await import(
    "@/features/sidebar/ui/AppSidebarPinnedHeader.tsx"
  );
  const { SidebarProvider, useSidebar } = await import(
    "@/shared/ui/sidebar.tsx"
  );
  const { setTerminalPanelMode, isLeftNavBuzzTermActive } = await import(
    "@/features/terminal/terminalPanelStore.ts"
  );
  return {
    React,
    ...testing,
    AppShellProvider,
    AppTopChrome,
    SurfaceTabsProvider,
    useSurfaceTabs,
    AppSidebarPrimaryMenu,
    SidebarProvider,
    useSidebar,
    setTerminalPanelMode,
    isLeftNavBuzzTermActive,
  };
}

function renderHarness(ui, communityId) {
  const {
    React,
    render,
    AppTopChrome,
    SurfaceTabsProvider,
    useSurfaceTabs,
    AppSidebarPrimaryMenu,
    SidebarProvider,
    useSidebar,
  } = ui;

  function Probe() {
    const sidebar = useSidebar();
    return React.createElement(
      "div",
      null,
      React.createElement(
        "div",
        { "data-testid": "sidebar-open" },
        sidebar.open ? "open" : "closed",
      ),
      React.createElement(
        "button",
        {
          type: "button",
          "data-testid": "reopen-sidebar",
          onClick: () => sidebar.setOpen(true),
        },
        "Reopen",
      ),
    );
  }

  function AddTools() {
    const tabs = useSurfaceTabs();
    const add = (label, target) => () => tabs.addTab({ label, target });
    return React.createElement(
      "div",
      { "data-testid": "surface-tab-tools" },
      React.createElement(
        "button",
        {
          type: "button",
          "data-testid": "add-long",
          onClick: add("A".repeat(40), { kind: "channel", channelId: "long" }),
        },
        "Add long",
      ),
      React.createElement(
        "button",
        {
          type: "button",
          "data-testid": "add-many",
          onClick: () => {
            for (let index = 0; index < 25; index += 1) {
              tabs.addTab({
                label: `Channel ${index}`,
                target: { kind: "channel", channelId: `ch-${index}` },
              });
            }
          },
        },
        "Add many",
      ),
      React.createElement(
        "button",
        {
          type: "button",
          "data-testid": "add-agents",
          onClick: add("Agents", { kind: "agents" }),
        },
        "Add agents",
      ),
      React.createElement(
        "button",
        {
          type: "button",
          "data-testid": "add-bots",
          onClick: add("Bots", { kind: "bots" }),
        },
        "Add bots",
      ),
    );
  }

  function noop() {}

  return render(
    React.createElement(
      SidebarProvider,
      null,
      React.createElement(
        SurfaceTabsProvider,
        { communityId },
        React.createElement(AppTopChrome, {
          canGoBack: false,
          canGoForward: false,
          onGoBack: noop,
          onGoForward: noop,
        }),
        React.createElement(Probe),
        React.createElement(AddTools),
        React.createElement(
          "div",
          { "data-testid": "app-sidebar" },
          React.createElement("input", {
            "aria-label": "Search",
            "data-testid": "sidebar-search",
          }),
          React.createElement(
            "button",
            {
              type: "button",
              "data-testid": "sidebar-row",
              onClick: () => {
                globalThis.__surfaceTabRowClicks.push("sidebar-row");
              },
            },
            "Panel row",
          ),
          React.createElement(AppSidebarPrimaryMenu, {
            includeProjects: false,
            onSelectAgents: () => {
              globalThis.__surfaceTabRowClicks.push("onSelectAgents");
            },
            onSelectBrowsers: noop,
            onSelectBots: noop,
            onSelectHome: () => {
              globalThis.__surfaceTabRowClicks.push("onSelectHome");
            },
            onSelectPinnedSite: noop,
            onSelectProjects: noop,
            onSelectPulse: noop,
            onSelectWorkflows: noop,
            projectsOverviewActive: false,
            selectedPinId: null,
            selectedView: "home",
          }),
        ),
      ),
    ),
  );
}

async function chooseAddAsTab(ui, rowName) {
  const { fireEvent, screen } = ui;
  const row = screen.getByRole("button", { name: rowName });
  fireEvent.contextMenu(row);
  const item = await screen.findByRole("menuitem", { name: "Add as Tab" });
  fireEvent.click(item);
}

test("labels truncate at 30 code points and bad storage is dropped", async () => {
  const model = await import("./surfaceTabModel.ts");
  const full = "A".repeat(40);
  assert.equal(model.surfaceTabFullLabel(`  ${full}  `), full);
  assert.equal(model.surfaceTabFullLabel("   "), "Untitled");
  assert.equal(model.truncateSurfaceTabLabel(full), `${"A".repeat(30)}…`);
  assert.equal(
    model.truncateSurfaceTabLabel("😀".repeat(31)).length,
    model.truncateSurfaceTabLabel("😀".repeat(30)).length + 1,
  );
  assert.equal(model.surfaceTabShortcutIndex("1", 1), 0);
  assert.equal(model.surfaceTabShortcutIndex("9", 8), null);
  assert.equal(model.surfaceTabShortcutIndex("0", 9), null);
  assert.deepEqual(model.readStoredSurfaceTabs("not-json"), []);
  assert.deepEqual(
    model.readStoredSurfaceTabs(
      JSON.stringify([
        { id: "ok", label: "Agents", target: { kind: "agents" } },
        { id: "bad", label: "Nope", target: { kind: "unknown" } },
        { id: "dup", label: "Agents again", target: { kind: "agents" } },
      ]),
    ),
    [{ id: "ok", label: "Agents", target: { kind: "agents" } }],
  );

  const menu = document.createElement("div");
  menu.setAttribute("role", "menuitem");
  const input = document.createElement("input");
  assert.equal(
    model.shouldLeaveTabForSidebarClick({ button: 2, target: input }),
    false,
  );
  assert.equal(
    model.shouldLeaveTabForSidebarClick({ button: 0, target: input }),
    false,
  );
  assert.equal(
    model.shouldLeaveTabForSidebarClick({ button: 0, target: menu }),
    false,
  );
  const row = document.createElement("button");
  assert.equal(
    model.shouldLeaveTabForSidebarClick({ button: 0, target: row }),
    true,
  );
});

test("Inbox Add as Tab fills the window and Home restores the panel", async () => {
  const ui = await loadUi();
  const { fireEvent, screen, waitFor } = ui;
  renderHarness(ui, "tabs-inbox");

  const sidebarToggle = screen.getByRole("button", { name: "Toggle Sidebar" });
  const refresh = screen.getByRole("button", { name: "Refresh" });
  const back = screen.getByTestId("global-back");
  const forward = screen.getByTestId("global-forward");
  const home = screen.getByRole("button", { name: "Home" });
  assert.equal(home.getAttribute("aria-pressed"), "true");
  assert.equal(home.getAttribute("title"), "Normal view");
  assert.equal(refresh.getAttribute("title"), "Refresh");
  assert.ok(sidebarToggle.compareDocumentPosition(refresh) & FOLLOWING);
  assert.ok(refresh.compareDocumentPosition(back) & FOLLOWING);
  assert.ok(back.compareDocumentPosition(forward) & FOLLOWING);
  assert.ok(forward.compareDocumentPosition(home) & FOLLOWING);
  assert.equal(screen.queryByRole("tab"), null);
  assert.equal(screen.getByTestId("sidebar-open").textContent, "open");

  fireEvent.click(home);
  assert.deepEqual(globalThis.__surfaceTabNav, []);
  assert.equal(screen.getByTestId("sidebar-open").textContent, "open");

  await chooseAddAsTab(ui, "Inbox");
  const tab = await screen.findByRole("tab", { name: "Inbox" });
  await waitFor(() => {
    assert.equal(screen.getByTestId("sidebar-open").textContent, "closed");
  });
  assert.equal(tab.getAttribute("aria-selected"), "true");
  assert.equal(tab.getAttribute("aria-keyshortcuts"), "Meta+1");
  assert.equal(home.getAttribute("aria-pressed"), "false");
  assert.deepEqual(globalThis.__surfaceTabNav, [["goHome"]]);
  const strip = screen.getByTestId("surface-tab-strip");
  const portal = document.getElementById("app-top-chrome-content");
  assert.equal(portal.contains(strip), false);
  assert.ok(home.compareDocumentPosition(strip) & FOLLOWING);

  fireEvent.click(home);
  await waitFor(() => {
    assert.equal(screen.getByTestId("sidebar-open").textContent, "open");
  });
  assert.equal(home.getAttribute("aria-pressed"), "true");
  assert.equal(tab.getAttribute("aria-selected"), "false");
  assert.deepEqual(globalThis.__surfaceTabNav, [["goHome"]]);

  fireEvent.click(tab);
  await waitFor(() => {
    assert.equal(screen.getByTestId("sidebar-open").textContent, "closed");
  });
  assert.deepEqual(globalThis.__surfaceTabNav, [["goHome"], ["goHome"]]);

  fireEvent.click(screen.getByRole("button", { name: "Close Inbox" }));
  await waitFor(() => {
    assert.equal(screen.queryByRole("tab", { name: "Inbox" }), null);
    assert.equal(screen.getByTestId("sidebar-open").textContent, "open");
  });
  assert.equal(home.getAttribute("aria-pressed"), "true");
});

test("a long name truncates, a duplicate focuses, and the cap drops the oldest", async () => {
  const ui = await loadUi();
  const { fireEvent, screen, waitFor } = ui;
  renderHarness(ui, "tabs-cap");

  fireEvent.click(screen.getByTestId("add-long"));
  const longName = "A".repeat(40);
  const longTab = await screen.findByRole("tab", { name: longName });
  assert.equal(longTab.textContent, `${"A".repeat(30)}…`);
  assert.equal(longTab.getAttribute("title"), longName);
  fireEvent.click(screen.getByTestId("add-long"));
  await waitFor(() => {
    assert.equal(screen.getAllByRole("tab").length, 1);
  });

  fireEvent.click(screen.getByTestId("add-many"));
  await waitFor(() => {
    assert.equal(screen.getAllByRole("tab").length, 20);
  });
  assert.equal(screen.queryByRole("tab", { name: "Channel 0" }), null);
  assert.equal(screen.queryByRole("tab", { name: "Channel 4" }), null);
  assert.ok(screen.getByRole("tab", { name: "Channel 5" }));
  assert.ok(screen.getByRole("tab", { name: "Channel 24" }));
  assert.equal(
    screen
      .getByRole("tab", { name: "Channel 24" })
      .getAttribute("aria-selected"),
    "true",
  );
});

test("Command plus a number switches tabs and a panel click returns home", async () => {
  const ui = await loadUi();
  const { fireEvent, screen, waitFor } = ui;
  const view = renderHarness(ui, "tabs-keys");

  fireEvent.click(screen.getByTestId("add-agents"));
  fireEvent.click(screen.getByTestId("add-bots"));
  await screen.findByRole("tab", { name: "Agents" });
  await screen.findByRole("tab", { name: "Bots" });
  await waitFor(() => {
    assert.equal(screen.getByTestId("sidebar-open").textContent, "closed");
  });

  fireEvent.click(screen.getByRole("button", { name: "Toggle Sidebar" }));
  await waitFor(() => {
    assert.equal(screen.getByTestId("sidebar-open").textContent, "open");
  });
  assert.equal(
    screen.getByRole("tab", { name: "Bots" }).getAttribute("aria-selected"),
    "true",
  );

  fireEvent.click(screen.getByTestId("sidebar-search"));
  assert.equal(
    screen.getByRole("tab", { name: "Bots" }).getAttribute("aria-selected"),
    "true",
  );

  fireEvent.click(screen.getByTestId("sidebar-row"));
  assert.deepEqual(globalThis.__surfaceTabRowClicks, ["sidebar-row"]);
  await waitFor(() => {
    assert.equal(
      screen.getByRole("button", { name: "Home" }).getAttribute("aria-pressed"),
      "true",
    );
  });
  assert.equal(screen.getByTestId("sidebar-open").textContent, "open");

  fireEvent.click(screen.getByRole("tab", { name: "Agents" }));
  await waitFor(() => {
    assert.equal(screen.getByTestId("sidebar-open").textContent, "closed");
  });
  const agentsCalls = globalThis.__surfaceTabNav.filter(
    (call) => call[0] === "goAgents",
  ).length;

  fireEvent.click(screen.getByRole("button", { name: "Toggle Sidebar" }));
  fireEvent.click(screen.getByRole("button", { name: "Agents" }));
  assert.ok(globalThis.__surfaceTabRowClicks.includes("onSelectAgents"));
  await waitFor(() => {
    assert.equal(
      screen.getByRole("button", { name: "Home" }).getAttribute("aria-pressed"),
      "true",
    );
  });
  assert.equal(screen.getByTestId("sidebar-open").textContent, "open");
  assert.equal(
    globalThis.__surfaceTabNav.filter((call) => call[0] === "goAgents").length,
    agentsCalls,
  );

  fireEvent.click(screen.getByRole("tab", { name: "Bots" }));
  fireEvent.keyDown(document.body, { key: "1", metaKey: true });
  await waitFor(() => {
    assert.equal(
      screen.getByRole("tab", { name: "Agents" }).getAttribute("aria-selected"),
      "true",
    );
  });
  fireEvent.keyDown(document.body, { key: "9", metaKey: true });
  assert.equal(
    screen.getByRole("tab", { name: "Agents" }).getAttribute("aria-selected"),
    "true",
  );
  fireEvent.keyDown(document.body, { key: "2", metaKey: true, shiftKey: true });
  assert.equal(
    screen.getByRole("tab", { name: "Agents" }).getAttribute("aria-selected"),
    "true",
  );
  screen.getByTestId("sidebar-search").focus();
  fireEvent.keyDown(document.body, { key: "2", metaKey: true });
  await waitFor(() => {
    assert.equal(
      screen.getByRole("tab", { name: "Bots" }).getAttribute("aria-selected"),
      "true",
    );
  });
  const stop = (event) => event.preventDefault();
  window.addEventListener("keydown", stop, true);
  fireEvent.keyDown(document.body, { key: "1", metaKey: true });
  window.removeEventListener("keydown", stop, true);
  assert.equal(
    screen.getByRole("tab", { name: "Bots" }).getAttribute("aria-selected"),
    "true",
  );
  assert.equal(
    screen
      .getByRole("button", { name: "Close Bots" })
      .getAttribute("aria-keyshortcuts"),
    "Meta+F4",
  );
  assert.equal(
    screen
      .getByRole("button", { name: "Close Agents" })
      .getAttribute("aria-keyshortcuts"),
    null,
  );
  assert.equal(
    screen
      .getByRole("button", { name: "Home" })
      .getAttribute("aria-keyshortcuts"),
    "Meta+`",
  );

  const navBeforeHome = globalThis.__surfaceTabNav.length;
  fireEvent.keyDown(document.body, {
    code: "Backquote",
    key: "`",
    metaKey: true,
    shiftKey: true,
  });
  assert.equal(
    screen.getByRole("tab", { name: "Bots" }).getAttribute("aria-selected"),
    "true",
  );
  screen.getByTestId("sidebar-search").focus();
  fireEvent.keyDown(document.body, {
    code: "Backquote",
    key: "Unidentified",
    metaKey: true,
  });
  await waitFor(() => {
    assert.equal(
      screen.getByRole("button", { name: "Home" }).getAttribute("aria-pressed"),
      "true",
    );
    assert.equal(screen.getByTestId("sidebar-open").textContent, "open");
  });
  assert.equal(
    screen.getByRole("tab", { name: "Bots" }).getAttribute("aria-selected"),
    "false",
  );
  assert.equal(globalThis.__surfaceTabNav.length, navBeforeHome);

  fireEvent.click(screen.getByRole("tab", { name: "Bots" }));
  await waitFor(() => {
    assert.equal(screen.getByTestId("sidebar-open").textContent, "closed");
  });
  fireEvent.keyDown(document.body, { code: "", key: "`", metaKey: true });
  await waitFor(() => {
    assert.equal(
      screen.getByRole("button", { name: "Home" }).getAttribute("aria-pressed"),
      "true",
    );
  });
  assert.equal(globalThis.__surfaceTabNav.length, navBeforeHome + 1);

  fireEvent.click(screen.getByRole("tab", { name: "Bots" }));
  await waitFor(() => {
    assert.equal(screen.getByTestId("sidebar-open").textContent, "closed");
  });

  fireEvent.keyDown(document.body, {
    key: "F4",
    metaKey: true,
    shiftKey: true,
  });
  assert.ok(screen.getByRole("tab", { name: "Bots" }));
  fireEvent.keyDown(document.body, { key: "F4" });
  assert.ok(screen.getByRole("tab", { name: "Bots" }));
  fireEvent.keyDown(document.body, { key: "F4", metaKey: true });
  await waitFor(() => {
    assert.equal(screen.queryByRole("tab", { name: "Bots" }), null);
    assert.equal(screen.getByTestId("sidebar-open").textContent, "open");
  });
  assert.equal(
    screen.getByRole("button", { name: "Home" }).getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(
    screen.getByRole("tab", { name: "Agents" }).getAttribute("aria-selected"),
    "false",
  );
  fireEvent.keyDown(document.body, { key: "F4", metaKey: true });
  assert.ok(screen.getByRole("tab", { name: "Agents" }));

  const stored = dom.window.localStorage.getItem(
    "buzz-surface-tabs.v1:tabs-keys",
  );
  assert.match(stored ?? "", /Agents/);
  view.unmount();
  globalThis.__surfaceTabNav = [];
  renderHarness(ui, "tabs-keys");
  await screen.findByRole("tab", { name: "Agents" });
  assert.equal(
    screen.getByRole("button", { name: "Home" }).getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(screen.getByTestId("sidebar-open").textContent, "open");
  assert.deepEqual(globalThis.__surfaceTabNav, []);
});

test("Buzz Term tab opens Term and the next tab leaves it", async () => {
  const ui = await loadUi();
  const { screen, waitFor, isLeftNavBuzzTermActive } = ui;
  ui.setTerminalPanelMode("closed");
  renderHarness(ui, "tabs-term");

  await chooseAddAsTab(ui, "Buzz Term");
  await screen.findByRole("tab", { name: "Buzz Term" });
  await waitFor(() => {
    assert.equal(isLeftNavBuzzTermActive(), true);
  });

  await chooseAddAsTab(ui, "Agents");
  await screen.findByRole("tab", { name: "Agents" });
  await waitFor(() => {
    assert.equal(isLeftNavBuzzTermActive(), false);
  });
  assert.ok(globalThis.__surfaceTabNav.some((call) => call[0] === "goAgents"));
});

test("a tab shows the left panel count and bold unread state", async () => {
  globalThis.__surfaceTabMenuCounts = {
    preferences: {
      inbox: false,
      agents: true,
      bots: false,
      browsers: false,
    },
    counts: { inbox: 4, agents: "2/9", browsers: 0, bots: 8 },
  };
  const ui = await loadUi();
  const { React, fireEvent, render, screen } = ui;

  function AddMarks() {
    const tabs = ui.useSurfaceTabs();
    const add = (testId, label, target) =>
      React.createElement(
        "button",
        {
          type: "button",
          "data-testid": testId,
          onClick: () => tabs.addTab({ label, target }),
        },
        label,
      );
    return React.createElement(
      "div",
      null,
      add("add-inbox-tab", "Inbox", { kind: "home" }),
      add("add-agents-tab", "Agents", { kind: "agents" }),
      add("add-bots-tab", "Bots", { kind: "bots" }),
      add("add-channel-tab", "General", {
        kind: "channel",
        channelId: "c1",
      }),
      add("add-thread-channel-tab", "Quiet", {
        kind: "channel",
        channelId: "c2",
      }),
      add("add-dm-tab", "Ada", { kind: "channel", channelId: "dm1" }),
      add("add-thread-tab", "Topic", {
        kind: "thread",
        channelId: "c1",
        rootId: "root-1",
      }),
    );
  }

  render(
    React.createElement(
      ui.AppShellProvider,
      {
        value: {
          unreadChannelIds: new Set(["c1", "dm1"]),
          unreadChannelCounts: new Map([
            ["c1", 4],
            ["dm1", 2],
          ]),
          dmChannelIds: new Set(["dm1"]),
          unreadThreadChannelIds: new Set(["c2"]),
          unreadThreadFeedItems: [
            {
              id: "m1",
              channelId: "c1",
              tags: [
                ["e", "root-1", "", "root"],
                ["e", "parent-1", "", "reply"],
              ],
            },
          ],
          hasSidebarUnreadProjections: true,
        },
      },
      React.createElement(
        ui.SidebarProvider,
        null,
        React.createElement(
          ui.SurfaceTabsProvider,
          { communityId: "tabs-marks" },
          React.createElement(ui.AppTopChrome, {
            canGoBack: false,
            canGoForward: false,
            onGoBack() {},
            onGoForward() {},
          }),
          React.createElement(AddMarks),
        ),
      ),
    ),
  );

  fireEvent.click(screen.getByTestId("add-inbox-tab"));
  fireEvent.click(screen.getByTestId("add-agents-tab"));
  fireEvent.click(screen.getByTestId("add-bots-tab"));
  fireEvent.click(screen.getByTestId("add-channel-tab"));
  fireEvent.click(screen.getByTestId("add-thread-channel-tab"));
  fireEvent.click(screen.getByTestId("add-dm-tab"));
  fireEvent.click(screen.getByTestId("add-thread-tab"));

  const inbox = screen.getByRole("tab", { name: "Inbox, 4" });
  assert.equal(inbox.getAttribute("data-unread"), "false");
  assert.equal(inbox.className.includes("font-bold"), false);
  assert.equal(
    inbox.querySelector("[data-testid^='surface-tab-count-']").textContent,
    "4",
  );

  const agents = screen.getByRole("tab", { name: "Agents, 2/9" });
  assert.equal(agents.getAttribute("data-unread"), "false");
  assert.equal(
    agents.querySelector("[data-testid^='surface-tab-count-']").textContent,
    "2/9",
  );

  const bots = screen.getByRole("tab", { name: "Bots" });
  assert.equal(bots.querySelector("[data-testid^='surface-tab-count-']"), null);

  const general = screen.getByRole("tab", { name: "General, 4 unread" });
  assert.equal(general.getAttribute("data-unread"), "true");
  assert.match(general.className, /\bfont-bold\b/);
  assert.equal(
    general.querySelector("[data-testid^='surface-tab-count-']").textContent,
    "4",
  );
  assert.equal(
    screen
      .getByRole("button", { name: "Close General" })
      .getAttribute("aria-label"),
    "Close General",
  );

  const quiet = screen.getByRole("tab", { name: "Quiet, 1 unread" });
  assert.equal(quiet.getAttribute("data-unread"), "true");
  assert.equal(
    quiet.querySelector("[data-testid^='surface-tab-count-']").textContent,
    "1",
  );

  const ada = screen.getByRole("tab", { name: "Ada, unread" });
  assert.equal(ada.getAttribute("data-unread"), "true");
  assert.match(ada.className, /\bfont-bold\b/);
  assert.equal(ada.querySelector("[data-testid^='surface-tab-count-']"), null);

  const topic = screen.getByRole("tab", { name: "Topic, 1 unread" });
  assert.equal(topic.getAttribute("data-unread"), "true");
  assert.equal(
    topic.querySelector("[data-testid^='surface-tab-count-']").textContent,
    "1",
  );
});

test("a tab of a working channel shows the thinking clock", async () => {
  globalThis.__surfaceTabWorking = new Map([
    [
      "c1",
      {
        channelId: "c1",
        anchorAt: Date.now() - 5_000,
        agentCount: 2,
        agentPubkeys: ["pk-ada", "pk-ned"],
        agentNames: ["Ada", "Ned"],
      },
    ],
  ]);
  const ui = await loadUi();
  const { React, fireEvent, render, screen } = ui;

  function AddWorking() {
    const tabs = ui.useSurfaceTabs();
    const add = (testId, label, target) =>
      React.createElement(
        "button",
        {
          type: "button",
          "data-testid": testId,
          onClick: () => tabs.addTab({ label, target }),
        },
        label,
      );
    return React.createElement(
      "div",
      null,
      add("add-inbox-tab", "Inbox", { kind: "home" }),
      add("add-channel-tab", "General", {
        kind: "channel",
        channelId: "c1",
      }),
      add("add-quiet-tab", "Quiet", { kind: "channel", channelId: "c2" }),
      add("add-thread-tab", "Topic", {
        kind: "thread",
        channelId: "c1",
        rootId: "root-1",
      }),
    );
  }

  render(
    React.createElement(
      ui.AppShellProvider,
      {
        value: {
          unreadChannelIds: new Set(["c1"]),
          unreadChannelCounts: new Map([["c1", 4]]),
          dmChannelIds: new Set(),
          unreadThreadChannelIds: new Set(),
          unreadThreadFeedItems: [],
          hasSidebarUnreadProjections: true,
        },
      },
      React.createElement(
        ui.SidebarProvider,
        null,
        React.createElement(
          ui.SurfaceTabsProvider,
          { communityId: "tabs-working" },
          React.createElement(ui.AppTopChrome, {
            canGoBack: false,
            canGoForward: false,
            onGoBack() {},
            onGoForward() {},
          }),
          React.createElement(AddWorking),
        ),
      ),
    ),
  );

  fireEvent.click(screen.getByTestId("add-inbox-tab"));
  fireEvent.click(screen.getByTestId("add-channel-tab"));
  fireEvent.click(screen.getByTestId("add-quiet-tab"));
  fireEvent.click(screen.getByTestId("add-thread-tab"));

  const general = screen.getByRole("tab", {
    name: "General, Ada and 1 agent working, 4 unread",
  });
  const generalClock = general.querySelector(
    "[data-testid^='surface-tab-working-']",
  );
  const generalCount = general.querySelector(
    "[data-testid^='surface-tab-count-']",
  );
  const generalName = general.querySelector("span");
  assert.match(generalClock.textContent, /^\d+s \(2\)$/);
  assert.equal(generalClock.getAttribute("title"), "Ada and 1 agent working");
  assert.equal(generalClock.className.includes("hidden"), false);
  assert.equal(generalCount.textContent, "4");
  assert.equal(
    generalName.compareDocumentPosition(generalClock) & FOLLOWING,
    FOLLOWING,
  );
  assert.equal(
    generalClock.compareDocumentPosition(generalCount) & FOLLOWING,
    FOLLOWING,
  );

  const topic = screen.getByRole("tab", {
    name: "Topic, Ada and 1 agent working",
  });
  assert.match(
    topic.querySelector("[data-testid^='surface-tab-working-']").textContent,
    /^\d+s \(2\)$/,
  );
  assert.equal(
    screen
      .getByRole("tab", { name: "Quiet" })
      .querySelector("[data-testid^='surface-tab-working-']"),
    null,
  );
  assert.equal(
    screen
      .getByRole("tab", { name: "Inbox" })
      .querySelector("[data-testid^='surface-tab-working-']"),
    null,
  );
});

test("unstarring drops only that thread tab", async () => {
  const model = await import("./surfaceTabModel.ts");
  const channel = {
    id: "channel-tab",
    label: "General",
    target: { kind: "channel", channelId: "ch-1" },
  };
  const starred = {
    id: "thread-tab",
    label: "Design chat",
    target: { kind: "thread", channelId: "ch-1", rootId: "root-1" },
  };
  const other = {
    id: "other-tab",
    label: "Other chat",
    target: { kind: "thread", channelId: "ch-2", rootId: "root-2" },
  };
  const tabs = [channel, starred, other];
  const removed = model.surfaceTabsWithoutThread(tabs, {
    channelId: "ch-1",
    rootId: "root-1",
  });
  assert.deepEqual(removed.removedIds, ["thread-tab"]);
  assert.deepEqual(removed.tabs, [channel, other]);
  const kept = model.surfaceTabsWithoutThread(tabs, {
    channelId: "ch-9",
    rootId: "root-1",
  });
  assert.equal(kept.tabs, tabs);
  assert.deepEqual(
    model.surfaceTabsWithoutThread(tabs, { rootId: "  " }).removedIds,
    [],
  );

  const provider = readFileSync(
    new URL("./SurfaceTabsProvider.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    provider,
    /const result = surfaceTabsWithoutThread\(tabsRef\.current, input\)/,
  );
  assert.match(
    provider,
    /result\.removedIds\.includes\(activeId\)\) \{\s*showNormalLayout\(\)/,
  );
  const header = readFileSync(
    new URL("../../features/messages/ui/ThreadStarButton.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    header,
    /if \(starred\) \{\s*surfaceTabs\?\.closeThreadTabs\(\{ channelId, rootId \}\);\s*\}/,
  );
  const menu = readFileSync(
    new URL(
      "../../features/sidebar/ui/SidebarStarredThreadsSection.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(
    menu,
    /surfaceTabs\?\.closeThreadTabs\(\{\s*channelId: entry\.channelId,\s*rootId: entry\.rootId,\s*\}\);\s*onUnstarThread\(entry\.rootId\)/,
  );
});

test("the thread star removes its tab and leaves the thread open", async () => {
  const ui = await loadUi();
  const { React, fireEvent, render, screen, waitFor } = ui;
  const { ThreadStarButton } = await import(
    "../../features/messages/ui/ThreadStarButton.tsx"
  );
  const { TooltipProvider } = await import("../../shared/ui/tooltip.tsx");

  function Probe() {
    const sidebar = ui.useSidebar();
    return React.createElement(
      "div",
      { "data-testid": "sidebar-open" },
      sidebar.open ? "open" : "closed",
    );
  }

  function Seed() {
    const tabs = ui.useSurfaceTabs();
    return React.createElement(
      "button",
      {
        type: "button",
        "data-testid": "seed-tabs",
        onClick: () => {
          tabs.addTab({
            label: "General",
            target: { kind: "channel", channelId: "ch-1" },
          });
          tabs.addTab({
            label: "Other chat",
            target: { kind: "thread", channelId: "ch-2", rootId: "root-2" },
          });
          tabs.addTab({
            label: "Design chat",
            target: { kind: "thread", channelId: "ch-1", rootId: "root-1" },
          });
        },
      },
      "Seed",
    );
  }

  render(
    React.createElement(
      ui.SidebarProvider,
      null,
      React.createElement(
        ui.SurfaceTabsProvider,
        { communityId: "tabs-unstar" },
        React.createElement(
          TooltipProvider,
          null,
          React.createElement(ui.AppTopChrome, {
            canGoBack: false,
            canGoForward: false,
            onGoBack() {},
            onGoForward() {},
          }),
          React.createElement(Probe),
          React.createElement(Seed),
          React.createElement(ThreadStarButton, {
            channelId: "ch-1",
            channelName: "general",
            currentPubkey: "pubkey-unstar-active",
            rootBody: "Design chat",
            rootId: "root-1",
          }),
        ),
      ),
    ),
  );

  fireEvent.click(screen.getByTestId("seed-tabs"));
  await screen.findByRole("tab", { name: "Design chat" });
  const navAfterOpen = globalThis.__surfaceTabNav.map((call) => [...call]);
  assert.equal(screen.getByTestId("sidebar-open").textContent, "closed");

  fireEvent.click(screen.getByRole("button", { name: "Star thread" }));
  assert.equal(
    screen
      .getByRole("tab", { name: "Design chat" })
      .getAttribute("aria-selected"),
    "true",
  );
  assert.deepEqual(globalThis.__surfaceTabNav, navAfterOpen);

  fireEvent.click(screen.getByRole("button", { name: "Unstar thread" }));
  await waitFor(() => {
    assert.equal(screen.queryByRole("tab", { name: "Design chat" }), null);
    assert.equal(screen.getByTestId("sidebar-open").textContent, "open");
  });
  assert.ok(screen.getByRole("tab", { name: "General" }));
  assert.ok(screen.getByRole("tab", { name: "Other chat" }));
  assert.equal(
    screen
      .getByRole("tab", { name: "Other chat" })
      .getAttribute("aria-selected"),
    "false",
  );
  assert.equal(
    screen.getByRole("button", { name: "Home" }).getAttribute("aria-pressed"),
    "true",
  );
  assert.deepEqual(globalThis.__surfaceTabNav, navAfterOpen);
});

test("unstarring an inactive thread tab leaves the open tab", async () => {
  const ui = await loadUi();
  const { React, fireEvent, render, screen } = ui;

  function Drop() {
    const tabs = ui.useSurfaceTabs();
    return React.createElement(
      "button",
      {
        type: "button",
        "data-testid": "drop-thread",
        onClick: () => {
          tabs.closeThreadTabs({ channelId: "ch-1", rootId: "root-1" });
        },
      },
      "Drop",
    );
  }

  function Seed() {
    const tabs = ui.useSurfaceTabs();
    return React.createElement(
      "button",
      {
        type: "button",
        "data-testid": "seed-inactive",
        onClick: () => {
          tabs.addTab({
            label: "Design chat",
            target: { kind: "thread", channelId: "ch-1", rootId: "root-1" },
          });
          tabs.addTab({
            label: "General",
            target: { kind: "channel", channelId: "ch-1" },
          });
        },
      },
      "Seed",
    );
  }

  render(
    React.createElement(
      ui.SidebarProvider,
      null,
      React.createElement(
        ui.SurfaceTabsProvider,
        { communityId: "tabs-unstar-inactive" },
        React.createElement(ui.AppTopChrome, {
          canGoBack: false,
          canGoForward: false,
          onGoBack() {},
          onGoForward() {},
        }),
        React.createElement(Seed),
        React.createElement(Drop),
      ),
    ),
  );

  fireEvent.click(screen.getByTestId("seed-inactive"));
  await screen.findByRole("tab", { name: "Design chat" });
  assert.equal(
    screen.getByRole("tab", { name: "General" }).getAttribute("aria-selected"),
    "true",
  );
  const navAfterOpen = globalThis.__surfaceTabNav.map((call) => [...call]);

  fireEvent.click(screen.getByTestId("drop-thread"));
  assert.equal(screen.queryByRole("tab", { name: "Design chat" }), null);
  assert.equal(
    screen.getByRole("tab", { name: "General" }).getAttribute("aria-selected"),
    "true",
  );
  assert.equal(
    screen.getByRole("button", { name: "Home" }).getAttribute("aria-pressed"),
    "false",
  );
  assert.deepEqual(globalThis.__surfaceTabNav, navAfterOpen);
});

test("renaming a starred thread renames its tab", async () => {
  const model = await import("./surfaceTabModel.ts");
  const channel = {
    id: "channel-tab",
    label: "General",
    target: { kind: "channel", channelId: "ch-1" },
  };
  const starred = {
    id: "thread-tab",
    label: "Design chat",
    target: { kind: "thread", channelId: "ch-1", rootId: "root-1" },
  };
  const other = {
    id: "other-tab",
    label: "Other chat",
    target: { kind: "thread", channelId: "ch-2", rootId: "root-2" },
  };
  const tabs = [channel, starred, other];
  const renamed = model.surfaceTabsWithThreadLabel(tabs, {
    channelId: "ch-1",
    label: "  Ship plan  ",
    rootId: "root-1",
  });
  assert.equal(renamed.changed, true);
  assert.equal(renamed.tabs[0], channel);
  assert.equal(renamed.tabs[1].label, "Ship plan");
  assert.equal(renamed.tabs[2], other);
  const same = model.surfaceTabsWithThreadLabel(renamed.tabs, {
    channelId: "ch-1",
    label: "Ship plan",
    rootId: "root-1",
  });
  assert.equal(same.changed, false);
  assert.equal(same.tabs, renamed.tabs);
  assert.equal(
    model.surfaceTabsWithThreadLabel(tabs, {
      channelId: "ch-9",
      label: "Nope",
      rootId: "root-1",
    }).tabs,
    tabs,
  );
  assert.equal(
    model.surfaceTabsWithThreadLabel(tabs, { label: "Nope", rootId: "  " })
      .changed,
    false,
  );

  const provider = readFileSync(
    new URL("./SurfaceTabsProvider.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    provider,
    /const result = surfaceTabsWithThreadLabel\(tabsRef\.current, input\)/,
  );
  const menu = readFileSync(
    new URL(
      "../../features/sidebar/ui/SidebarStarredThreadsSection.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(
    menu,
    /label: starredThreadTitle\(entry\.title, labelFor\(entry\.rootId\)\?\.name\)/,
  );
  assert.match(menu, /surfaceTabs\.renameThreadTab\(item\)/);

  const ui = await loadUi();
  const { React, fireEvent, render, screen } = ui;

  function Rename() {
    const tabs = ui.useSurfaceTabs();
    return React.createElement(
      "button",
      {
        type: "button",
        "data-testid": "rename-thread",
        onClick: () => {
          tabs.renameThreadTab({
            channelId: "ch-1",
            label: "Ship plan",
            rootId: "root-1",
          });
        },
      },
      "Rename",
    );
  }

  function Seed() {
    const tabs = ui.useSurfaceTabs();
    return React.createElement(
      "button",
      {
        type: "button",
        "data-testid": "seed-rename",
        onClick: () => {
          tabs.addTab({
            label: "General",
            target: { kind: "channel", channelId: "ch-1" },
          });
          tabs.addTab({
            label: "Other chat",
            target: { kind: "thread", channelId: "ch-2", rootId: "root-2" },
          });
          tabs.addTab({
            label: "Design chat",
            target: { kind: "thread", channelId: "ch-1", rootId: "root-1" },
          });
        },
      },
      "Seed",
    );
  }

  render(
    React.createElement(
      ui.SidebarProvider,
      null,
      React.createElement(
        ui.SurfaceTabsProvider,
        { communityId: "tabs-rename" },
        React.createElement(ui.AppTopChrome, {
          canGoBack: false,
          canGoForward: false,
          onGoBack() {},
          onGoForward() {},
        }),
        React.createElement(Seed),
        React.createElement(Rename),
      ),
    ),
  );

  fireEvent.click(screen.getByTestId("seed-rename"));
  await screen.findByRole("tab", { name: "Design chat" });
  assert.equal(
    screen
      .getByRole("tab", { name: "Design chat" })
      .getAttribute("aria-selected"),
    "true",
  );
  const navAfterOpen = globalThis.__surfaceTabNav.map((call) => [...call]);

  fireEvent.click(screen.getByTestId("rename-thread"));
  assert.equal(screen.queryByRole("tab", { name: "Design chat" }), null);
  assert.equal(
    screen
      .getByRole("tab", { name: "Ship plan" })
      .getAttribute("aria-selected"),
    "true",
  );
  assert.ok(screen.getByRole("tab", { name: "General" }));
  assert.ok(screen.getByRole("tab", { name: "Other chat" }));
  assert.equal(
    screen.getByRole("button", { name: "Home" }).getAttribute("aria-pressed"),
    "false",
  );
  assert.deepEqual(globalThis.__surfaceTabNav, navAfterOpen);

  fireEvent.click(screen.getByTestId("rename-thread"));
  assert.equal(
    screen
      .getByRole("tab", { name: "Ship plan" })
      .getAttribute("aria-selected"),
    "true",
  );
});
