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

function commit(subject, authorName, authorEmail, hash, repoName, repoAddress) {
  return {
    commit: {
      authorEmail,
      authorName,
      hash,
      shortHash: hash.slice(0, 7),
      subject,
      timestamp: 1,
    },
    project: { name: repoName, repoAddress },
  };
}

test("commit filters hide rows that do not match and keep the full list recoverable", async () => {
  const { cleanup, fireEvent, render, screen } = await import(
    "@testing-library/react"
  );
  const { ProjectCommitBrowser } = await import("./ProjectCommitBrowser.tsx");
  const React = await import("react");
  const items = [
    commit(
      "Add the desktop app",
      "Ada Lovelace",
      "ada@example.com",
      "a".repeat(40),
      "claimminer",
      "30617:owner:claimminer",
    ),
    commit(
      "Fix the relay",
      "Grace Hopper",
      "grace@example.com",
      "b".repeat(40),
      "desktop",
      "30617:owner:desktop",
    ),
  ];

  try {
    render(
      React.createElement(ProjectCommitBrowser, {
        historyTruncated: true,
        items,
        renderItems: (filtered) =>
          React.createElement(
            "ul",
            null,
            filtered.map((item) =>
              React.createElement(
                "li",
                { key: item.commit.hash },
                item.commit.subject,
              ),
            ),
          ),
      }),
    );

    assert.match(
      screen.getByTestId("project-commit-count").textContent,
      /2 commits/,
    );
    assert.match(
      screen.getByTestId("project-commit-history-truncated").textContent,
      /newest history that fit in one read/,
    );
    fireEvent.change(screen.getByTestId("project-commit-search"), {
      target: { value: "relay" },
    });
    assert.equal(document.body.textContent.includes("Fix the relay"), true);
    assert.equal(
      document.body.textContent.includes("Add the desktop app"),
      false,
    );
    assert.match(
      screen.getByTestId("project-commit-count").textContent,
      /1 of 2 commits/,
    );
    assert.equal(document.body.textContent.includes("No commits yet"), false);

    fireEvent.change(screen.getByTestId("project-commit-search"), {
      target: { value: "missing-subject" },
    });
    assert.match(
      screen.getByTestId("project-commit-filter-empty").textContent,
      /No matching commits/,
    );
    assert.match(
      screen.getByTestId("project-commit-filter-empty").textContent,
      /Clear the filters to see every commit/,
    );

    fireEvent.click(screen.getByTestId("project-commit-clear-filters"));
    assert.equal(
      document.body.textContent.includes("Add the desktop app"),
      true,
    );
    assert.equal(document.body.textContent.includes("Fix the relay"), true);

    fireEvent.change(screen.getByTestId("project-commit-author-filter"), {
      target: { value: "grace@example.com" },
    });
    assert.equal(document.body.textContent.includes("Fix the relay"), true);
    assert.equal(
      document.body.textContent.includes("Add the desktop app"),
      false,
    );

    fireEvent.change(screen.getByTestId("project-commit-author-filter"), {
      target: { value: "all" },
    });
    fireEvent.change(screen.getByTestId("project-commit-repo-filter"), {
      target: { value: "30617:owner:claimminer" },
    });
    assert.equal(
      document.body.textContent.includes("Add the desktop app"),
      true,
    );
    assert.equal(document.body.textContent.includes("Fix the relay"), false);
  } finally {
    cleanup();
  }
});

test("the last 30 days hides older commits and clear brings them back", async () => {
  const { cleanup, fireEvent, render, screen } = await import(
    "@testing-library/react"
  );
  const { ProjectCommitBrowser } = await import("./ProjectCommitBrowser.tsx");
  const React = await import("react");
  const now = 1_700_000_000;
  const day = 24 * 60 * 60;
  const recent = commit(
    "Recent commit",
    "Ada Lovelace",
    "ada@example.com",
    "d".repeat(40),
    "claimminer",
    "30617:owner:claimminer",
  );
  recent.commit.timestamp = now - 10 * day;
  const older = commit(
    "Older commit",
    "Ada Lovelace",
    "ada@example.com",
    "e".repeat(40),
    "claimminer",
    "30617:owner:claimminer",
  );
  older.commit.timestamp = now - 40 * day;

  try {
    render(
      React.createElement(ProjectCommitBrowser, {
        items: [recent, older],
        nowSeconds: now,
        renderItems: (filtered) =>
          React.createElement(
            "ul",
            null,
            filtered.map((item) =>
              React.createElement(
                "li",
                { key: item.commit.hash },
                item.commit.subject,
              ),
            ),
          ),
      }),
    );

    const dateFilter = screen.getByTestId("project-commit-date-filter");
    assert.match(dateFilter.textContent, /Last 30 days/);
    assert.match(dateFilter.textContent, /All time/);
    fireEvent.change(dateFilter, { target: { value: "30d" } });
    assert.equal(document.body.textContent.includes("Recent commit"), true);
    assert.equal(document.body.textContent.includes("Older commit"), false);
    assert.match(
      screen.getByTestId("project-commit-count").textContent,
      /1 of 2 commits/,
    );
    fireEvent.click(screen.getByTestId("project-commit-clear-filters"));
    assert.equal(document.body.textContent.includes("Recent commit"), true);
    assert.equal(document.body.textContent.includes("Older commit"), true);
    assert.equal(dateFilter.value, "all");
  } finally {
    cleanup();
  }
});

test("all commits shows commits from outside this branch", async () => {
  const { cleanup, fireEvent, render, screen } = await import(
    "@testing-library/react"
  );
  const { ProjectCommitBrowser } = await import("./ProjectCommitBrowser.tsx");
  const React = await import("react");
  const now = 1_700_000_000;
  const day = 24 * 60 * 60;
  const recent = commit(
    "On this branch",
    "Ada Lovelace",
    "ada@example.com",
    "f".repeat(40),
    "claimminer",
    "30617:owner:claimminer",
  );
  recent.commit.timestamp = now - 10 * day;
  const other = commit(
    "Only on the other branch",
    "Grace Hopper",
    "grace@example.com",
    "9".repeat(40),
    "claimminer",
    "30617:owner:claimminer",
  );
  other.commit.timestamp = now - 40 * day;

  function Harness() {
    const [scope, setScope] = React.useState("branch");
    const items = scope === "all" ? [recent, other] : [recent];
    return React.createElement(ProjectCommitBrowser, {
      historyScope: scope,
      items,
      nowSeconds: now,
      onHistoryScopeChange: setScope,
      renderItems: (filtered) =>
        React.createElement(
          "ul",
          null,
          filtered.map((item) =>
            React.createElement(
              "li",
              { key: item.commit.hash },
              item.commit.subject,
            ),
          ),
        ),
    });
  }

  try {
    render(React.createElement(Harness));
    const history = screen.getByTestId("project-commit-history-filter");
    assert.match(history.textContent, /All commits/);
    assert.match(history.textContent, /This branch/);
    assert.equal(history.value, "branch");
    assert.equal(
      document.body.textContent.includes("Only on the other branch"),
      false,
    );
    fireEvent.change(history, { target: { value: "all" } });
    assert.equal(
      document.body.textContent.includes("Only on the other branch"),
      true,
    );
    assert.equal(document.body.textContent.includes("On this branch"), true);
    fireEvent.change(screen.getByTestId("project-commit-date-filter"), {
      target: { value: "30d" },
    });
    assert.equal(
      document.body.textContent.includes("Only on the other branch"),
      false,
    );
    fireEvent.click(screen.getByTestId("project-commit-clear-filters"));
    assert.equal(history.value, "all");
    assert.equal(
      document.body.textContent.includes("Only on the other branch"),
      true,
    );
  } finally {
    cleanup();
  }
});

test("a failed all-commits read stays an error", async () => {
  const { cleanup, render, screen } = await import("@testing-library/react");
  const { ProjectCommitBrowser } = await import("./ProjectCommitBrowser.tsx");
  const React = await import("react");

  try {
    const { rerender } = render(
      React.createElement(ProjectCommitBrowser, {
        historyLoading: true,
        historyScope: "all",
        items: [],
        onHistoryScopeChange: () => undefined,
        renderItems: () => null,
      }),
    );
    assert.match(document.body.textContent, /Reading every commit/);
    assert.equal(screen.queryByTestId("project-commit-filter-empty"), null);
    rerender(
      React.createElement(ProjectCommitBrowser, {
        historyError: true,
        historyScope: "all",
        items: [],
        onHistoryScopeChange: () => undefined,
        renderItems: () => null,
      }),
    );
    assert.match(
      screen.getByTestId("project-commit-history-error").textContent,
      /Could not read every commit/,
    );
  } finally {
    cleanup();
  }
});
