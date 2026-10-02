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

const React = await import("react");
const { act, cleanup, renderHook } = await import("@testing-library/react");
const { QueryClient, QueryClientProvider } = await import(
  "@tanstack/react-query"
);
const { useLiveProjectWorkItemSubscription } = await import(
  "./useLiveProjectWorkItems.ts"
);

const REPO = "30617:aa:products-hulabill";
const projects = [{ repositories: [{ repoAddress: REPO }] }];

afterEach(() => {
  cleanup();
});

function renderSubscription(subscribeLive, refreshDelayMs = 0) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const refreshes = [];
  queryClient.invalidateQueries = (filters) => {
    refreshes.push(filters);
    return Promise.resolve();
  };
  const view = renderHook(
    () =>
      useLiveProjectWorkItemSubscription(projects, {
        refreshDelayMs,
        subscribeLive,
      }),
    {
      wrapper: ({ children }) =>
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          children,
        ),
    },
  );
  return { ...view, refreshes };
}

test("a burst of matching task events refreshes the open task queries once", async () => {
  let onEvent = () => {};
  const filters = [];
  const subscribeLive = async (filter, listener) => {
    filters.push(filter);
    onEvent = listener;
    return async () => {};
  };
  const { refreshes } = renderSubscription(subscribeLive);
  await act(async () => {
    await Promise.resolve();
  });

  assert.equal(filters.length, 1);
  assert.equal(filters[0].limit, 0);
  assert.deepEqual(filters[0]["#a"], [REPO]);

  await act(async () => {
    onEvent({ tags: [["a", REPO]] });
    onEvent({ tags: [["a", REPO]] });
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  assert.equal(refreshes.length, 1);
  const predicate = refreshes[0].predicate;
  assert.equal(predicate({ queryKey: ["projects", "work-items", "a"] }), true);
  assert.equal(
    predicate({ queryKey: ["projects", "activity-summaries", "a"] }),
    true,
  );
  assert.equal(predicate({ queryKey: ["projects"] }), false);
});

test("an event for another repository does not refresh tasks", async () => {
  let onEvent = () => {};
  const subscribeLive = async (_filter, listener) => {
    onEvent = listener;
    return async () => {};
  };
  const { refreshes } = renderSubscription(subscribeLive);
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    onEvent({ tags: [["a", "30617:bb:elsewhere"]] });
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  assert.equal(refreshes.length, 0);
});

test("leaving the session closes the task subscription", async () => {
  let unsubscribed = false;
  const subscribeLive = async () => {
    return async () => {
      unsubscribed = true;
    };
  };
  const { unmount } = renderSubscription(subscribeLive);
  await act(async () => {
    await Promise.resolve();
  });
  unmount();
  await act(async () => {
    await Promise.resolve();
  });
  assert.equal(unsubscribed, true);
});

test("no repositories means no task subscription", async () => {
  let calls = 0;
  const subscribeLive = async () => {
    calls += 1;
    return async () => {};
  };
  const queryClient = new QueryClient();
  renderHook(
    () =>
      useLiveProjectWorkItemSubscription([], {
        subscribeLive,
      }),
    {
      wrapper: ({ children }) =>
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          children,
        ),
    },
  );
  await act(async () => {
    await Promise.resolve();
  });
  assert.equal(calls, 0);
});
