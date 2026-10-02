import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost",
});

before(() => {
  Object.assign(globalThis, {
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
    Node: dom.window.Node,
    window: dom.window,
  });
});

after(() => dom.window.close());

test("choosing a dock row collapses before it navigates", async () => {
  const { withCollapsedPrimaryMenu } = await import(
    "../lib/primaryMenuScrollAway.ts"
  );
  const calls = [];
  const props = {
    onSelectAgents() {
      calls.push("agents");
    },
    onSelectBrowsers() {
      calls.push("browsers");
    },
    onSelectBots() {
      calls.push("bots");
    },
    onSelectHome() {
      calls.push("home");
    },
    onSelectPinnedSite(pinId) {
      calls.push(`pin:${pinId}`);
    },
    onSelectProjects() {
      calls.push("projects");
    },
    onSelectPulse() {
      calls.push("pulse");
    },
    onSelectWorkflows() {
      calls.push("workflows");
    },
    projectsOverviewActive: false,
    selectedPinId: null,
    selectedView: "home",
  };
  const wrapped = withCollapsedPrimaryMenu(props, () => {
    calls.push("collapse");
  });

  wrapped.onSelectHome();
  wrapped.onSelectPinnedSite("term");
  assert.deepEqual(calls, ["collapse", "home", "collapse", "pin:term"]);
});

test("the Menu row is hidden until the menu is gone, then expands and collapses", async () => {
  const React = await import("react");
  const { cleanup, fireEvent, render, screen } = await import(
    "@testing-library/react"
  );
  const { SidebarMenuDock } = await import("./SidebarMenuDock.tsx");

  const scroll = document.createElement("div");
  let scrollTop = 0;
  Object.defineProperty(scroll, "scrollTop", {
    configurable: true,
    get() {
      return scrollTop;
    },
    set(value) {
      scrollTop = value;
    },
  });

  function dock(away) {
    return React.createElement(SidebarMenuDock, {
      away,
      renderMenu: (collapse) =>
        React.createElement(
          "button",
          {
            "data-testid": "dock-buzz-term",
            onClick: collapse,
            type: "button",
          },
          "Buzz Term",
        ),
      scrollRef: { current: scroll },
    });
  }

  const view = render(dock(false));
  assert.equal(screen.queryByTestId("sidebar-menu-dock"), null);

  view.rerender(dock(true));
  const toggle = screen.getByTestId("sidebar-menu-dock-toggle");
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  assert.equal(toggle.textContent, "Menu");
  assert.equal(screen.queryByTestId("dock-buzz-term"), null);
  const menuDock = screen.getByTestId("sidebar-menu-dock");
  assert.match(menuDock.className, /inset-x-0/);
  assert.match(menuDock.className, /bg-sidebar/);
  assert.match(menuDock.className, /\bz-30\b/);
  assert.match(menuDock.className, /\bisolate\b/);
  assert.equal(menuDock.hasAttribute("data-buzz-flat"), true);

  fireEvent.click(toggle);
  const panel = screen.getByTestId("sidebar-menu-dock-panel");
  assert.match(panel.className, /bg-sidebar/);
  assert.equal(panel.hasAttribute("data-buzz-flat"), true);
  assert.equal(toggle.getAttribute("aria-expanded"), "true");
  assert.equal(
    screen.getByTestId("sidebar-menu-dock-panel").id,
    toggle.getAttribute("aria-controls"),
  );
  fireEvent.click(screen.getByTestId("dock-buzz-term"));
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  assert.equal(screen.queryByTestId("dock-buzz-term"), null);

  fireEvent.click(toggle);
  fireEvent.keyDown(screen.getByTestId("sidebar-menu-dock-panel"), {
    key: "Escape",
  });
  assert.equal(document.activeElement, toggle);
  assert.equal(toggle.getAttribute("aria-expanded"), "false");

  fireEvent.wheel(screen.getByTestId("sidebar-menu-dock"), { deltaY: 40 });
  assert.equal(scrollTop, 40);

  view.rerender(dock(false));
  assert.equal(screen.queryByTestId("sidebar-menu-dock"), null);
  view.rerender(dock(true));
  assert.equal(
    screen
      .getByTestId("sidebar-menu-dock-toggle")
      .getAttribute("aria-expanded"),
    "false",
  );

  cleanup();
});

test("scrolling channel list stays under the menu dock", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(
    new URL("./AppSidebar.tsx", import.meta.url),
    "utf8",
  );
  const scroll = source.match(/<SidebarContent\s+className="([^"]+)"/);
  assert.ok(scroll);
  assert.match(scroll[1], /\brelative\b/);
  assert.match(scroll[1], /\bisolate\b/);
  assert.match(scroll[1], /\bz-0\b/);
});
