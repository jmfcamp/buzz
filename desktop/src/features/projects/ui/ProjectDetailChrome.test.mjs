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
    window: dom.window,
  });
});

after(() => dom.window.close());

test("the project breadcrumb is a full-width band in the canvas", async () => {
  const { cleanup, render, screen } = await import("@testing-library/react");
  const { ProjectDetailChrome } = await import("./ProjectDetailChrome.tsx");
  const React = await import("react");
  const portal = dom.window.document.createElement("div");
  portal.id = "app-top-chrome-content";
  dom.window.document.body.append(portal);

  try {
    render(
      React.createElement(ProjectDetailChrome, {
        actions: React.createElement("button", { type: "button" }, "Context"),
        activeTabCrumb: "Commits",
        activeWorkItemCrumb: null,
        onGoProjectHome: () => undefined,
        onGoProjects: () => undefined,
        project: { name: "claimminer" },
        repository: { name: "desktop" },
      }),
    );
    const band = screen.getByTestId("project-detail-chrome");
    assert.equal(band.className.includes("bg-muted"), true);
    assert.equal(portal.contains(band), false);
    assert.equal(
      screen.getByRole("navigation").textContent.includes("Projects"),
      true,
    );
    assert.equal(
      screen.getByTestId("project-breadcrumb-project").textContent,
      "claimminer",
    );
    assert.equal(
      screen.getByTestId("project-breadcrumb-repository").textContent,
      "desktop",
    );
    assert.equal(band.textContent.includes("Commits"), true);
    assert.equal(band.textContent.includes("Context"), true);
    assert.equal(band.className.includes("rounded-2xl"), false);
    assert.equal(band.className.includes("border-b"), true);
  } finally {
    cleanup();
    portal.remove();
  }
});

test("a detached project breadcrumb is a rounded surface", async () => {
  const { cleanup, render, screen } = await import("@testing-library/react");
  const { ProjectDetailChrome } = await import("./ProjectDetailChrome.tsx");
  const React = await import("react");

  try {
    render(
      React.createElement(ProjectDetailChrome, {
        activeTabCrumb: null,
        activeWorkItemCrumb: null,
        onGoProjectHome: () => undefined,
        onGoProjects: () => undefined,
        project: { name: "claimminer" },
        rounded: true,
      }),
    );
    const band = screen.getByTestId("project-detail-chrome");
    assert.equal(band.className.includes("rounded-2xl"), true);
    assert.equal(band.className.includes("ml-px"), true);
    assert.equal(band.className.includes("mr-2"), true);
    assert.equal(band.className.includes("border-b"), false);
  } finally {
    cleanup();
  }
});
