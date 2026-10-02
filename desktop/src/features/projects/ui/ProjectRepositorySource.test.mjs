import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost",
});

before(() => {
  for (const key of Object.getOwnPropertyNames(dom.window)) {
    if (key === "window" || key === "document" || key === "globalThis") {
      continue;
    }
    const value = dom.window[key];
    if (
      typeof value === "function" &&
      /^(HTML|SVG)|Element$|Event$|EventTarget$|^Node|^Document|Observer$/.test(
        key,
      )
    ) {
      globalThis[key] = value;
    }
  }
  Object.assign(globalThis, {
    document: dom.window.document,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    IS_REACT_ACT_ENVIRONMENT: true,
    window: dom.window,
  });
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  dom.window.HTMLElement.prototype.hasPointerCapture = () => false;
  dom.window.HTMLElement.prototype.setPointerCapture = () => {};
  dom.window.HTMLElement.prototype.releasePointerCapture = () => {};
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
});

after(() => dom.window.close());

const baseControls = {
  branch: "main",
  branchOptions: ["main"],
  localDisabled: false,
  localLabel: "Local missing",
  onBranchChange: () => undefined,
  onSourceChange: () => undefined,
  remoteLabel: "Buzz",
  source: "remote",
};

test("an OpenClaw repository hides the remote and local menu", async () => {
  const { cleanup, render, screen } = await import("@testing-library/react");
  const { RepoSourceDropdown, openClawRepoSourceControls } = await import(
    "./ProjectRepositorySource.tsx"
  );
  const React = await import("react");
  const controls = openClawRepoSourceControls(baseControls, {
    onFetch: () => undefined,
    pending: false,
  });

  try {
    assert.equal(controls.showSourcePicker, false);
    assert.equal(controls.remoteLabel, "OpenClaw");
    render(React.createElement(RepoSourceDropdown, { controls }));
    assert.equal(screen.queryByRole("button"), null);
    assert.equal(document.body.textContent.includes("Local missing"), false);
    assert.equal(document.body.textContent.includes("OpenClaw"), false);
  } finally {
    cleanup();
  }
});

test("the checked-out OpenClaw branch stays marked while another branch is shown", async () => {
  const { act, cleanup, fireEvent, render, screen } = await import(
    "@testing-library/react"
  );
  const { RepositoryBranchDropdown, openClawRepoSourceControls } = await import(
    "./ProjectRepositorySource.tsx"
  );
  const React = await import("react");
  const chosen = [];
  const controls = openClawRepoSourceControls(
    { ...baseControls, branch: "feature", branchOptions: ["main", "feature"] },
    {
      checkedOutBranch: " main ",
      onFetch: () => undefined,
      pending: false,
    },
  );

  try {
    assert.equal(controls.checkedOutBranch, "main");
    assert.equal(
      openClawRepoSourceControls(
        { ...baseControls, checkedOutBranch: "stale" },
        { onFetch: () => undefined, pending: false },
      ).checkedOutBranch,
      null,
    );
    render(
      React.createElement(RepositoryBranchDropdown, {
        branch: controls.branch,
        branchOptions: controls.branchOptions,
        checkedOutBranch: controls.checkedOutBranch,
        onBranchChange: (branch) => {
          chosen.push(branch);
        },
      }),
    );
    const trigger = screen.getByTestId("project-repository-branch-trigger");
    assert.match(trigger.textContent, /feature/);
    assert.equal(trigger.textContent.includes("Current"), false);
    await act(async () => {
      fireEvent.pointerDown(
        trigger,
        new dom.window.MouseEvent("pointerdown", { bubbles: true, button: 0 }),
      );
      fireEvent.click(trigger);
    });
    const mark = screen.getByTestId("project-branch-checked-out");
    assert.equal(mark.textContent, "Current");
    assert.equal(
      mark.getAttribute("title"),
      "Checked out. Choose this to see the current files.",
    );
    const rows = [...document.querySelectorAll('[role="menuitemradio"]')];
    const currentRow = rows.find((row) => row.contains(mark));
    const featureRow = rows.find((row) => row.textContent?.includes("feature"));
    assert.equal(currentRow?.textContent?.includes("main"), true);
    assert.equal(featureRow?.textContent?.includes("Current"), false);
    await act(async () => {
      fireEvent.click(currentRow);
    });
    assert.deepEqual(chosen, ["main"]);
  } finally {
    cleanup();
  }
});

test("a relay repository keeps the source menu", async () => {
  const { cleanup, render, screen } = await import("@testing-library/react");
  const { RepoSourceDropdown } = await import("./ProjectRepositorySource.tsx");
  const React = await import("react");

  try {
    render(React.createElement(RepoSourceDropdown, { controls: baseControls }));
    assert.match(screen.getByRole("button").textContent, /Buzz/);
  } finally {
    cleanup();
  }
});
