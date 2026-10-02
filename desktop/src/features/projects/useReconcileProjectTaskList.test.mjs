import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost",
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true,
});

const { act, cleanup, renderHook } = await import("@testing-library/react");
const { useReconcileProjectTaskList } = await import(
  "./useReconcileProjectTaskList.ts"
);

afterEach(() => {
  cleanup();
});

test("an empty task list refreshes once when the rail count is ahead", async () => {
  let calls = 0;
  let resolveRefresh = () => {};
  const refetch = () => {
    calls += 1;
    return new Promise((resolve) => {
      resolveRefresh = resolve;
    });
  };
  const { result, rerender } = renderHook(
    (props) => useReconcileProjectTaskList(props),
    {
      initialProps: { issueCount: 3, loadedIssueCount: 0, refetch },
    },
  );

  assert.equal(result.current, true);
  assert.equal(calls, 1);

  rerender({ issueCount: 3, loadedIssueCount: 0, refetch });
  assert.equal(calls, 1);
  assert.equal(result.current, true);

  await act(async () => {
    resolveRefresh();
    await Promise.resolve();
  });
  assert.equal(result.current, false);
  assert.equal(calls, 1);
});

test("a failed refresh releases the empty list", async () => {
  let calls = 0;
  const refetch = () => {
    calls += 1;
    return Promise.reject(new Error("relay down"));
  };
  const { result } = renderHook(() =>
    useReconcileProjectTaskList({
      issueCount: 3,
      loadedIssueCount: 0,
      refetch,
    }),
  );

  assert.equal(result.current, true);
  await act(async () => {
    await Promise.resolve();
  });
  assert.equal(calls, 1);
  assert.equal(result.current, false);
});

test("a list that already matches the rail count stays put", () => {
  let calls = 0;
  const refetch = () => {
    calls += 1;
    return Promise.resolve();
  };
  const { result } = renderHook(() =>
    useReconcileProjectTaskList({
      issueCount: 3,
      loadedIssueCount: 3,
      refetch,
    }),
  );

  assert.equal(result.current, false);
  assert.equal(calls, 0);
});
