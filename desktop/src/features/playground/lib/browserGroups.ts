/**
 * Playground browser groups: one left-nav Browsers row per group.
 * Each tab is a PlaygroundSession sid with its own WKWebView.
 */

export type PlaygroundBrowser = {
  browserId: string;
  tabSids: string[];
  activeTabSid: string;
};

export function createOneTabBrowser(sid: string, browserId = sid): PlaygroundBrowser {
  return {
    browserId,
    tabSids: [sid],
    activeTabSid: sid,
  };
}

export function migrateSessionsToBrowsers(
  sids: readonly string[],
  existing: readonly PlaygroundBrowser[] = [],
): PlaygroundBrowser[] {
  const covered = new Set<string>();
  const browsers: PlaygroundBrowser[] = [];
  for (const browser of existing) {
    const tabSids = browser.tabSids.filter((sid) => sids.includes(sid));
    if (tabSids.length === 0) continue;
    const activeTabSid = tabSids.includes(browser.activeTabSid)
      ? browser.activeTabSid
      : tabSids[0]!;
    browsers.push({
      browserId: browser.browserId,
      tabSids,
      activeTabSid,
    });
    for (const sid of tabSids) covered.add(sid);
  }
  for (const sid of sids) {
    if (covered.has(sid)) continue;
    browsers.push(createOneTabBrowser(sid));
  }
  return browsers;
}

export function findBrowserByTabSid(
  browsers: readonly PlaygroundBrowser[],
  sid: string,
): PlaygroundBrowser | null {
  return browsers.find((browser) => browser.tabSids.includes(sid)) ?? null;
}

export function findBrowserById(
  browsers: readonly PlaygroundBrowser[],
  browserId: string,
): PlaygroundBrowser | null {
  return browsers.find((browser) => browser.browserId === browserId) ?? null;
}

/** Append a tab and make it active. */
export function addTabToBrowser(
  browser: PlaygroundBrowser,
  sid: string,
): PlaygroundBrowser {
  if (browser.tabSids.includes(sid)) {
    return { ...browser, activeTabSid: sid };
  }
  return {
    ...browser,
    tabSids: [...browser.tabSids, sid],
    activeTabSid: sid,
  };
}

/**
 * Remove a tab. Returns null when the group is empty (caller should drop it).
 * If the closed tab was active, activates the previous tab (or next, or first).
 */
export function removeTabFromBrowser(
  browser: PlaygroundBrowser,
  sid: string,
): PlaygroundBrowser | null {
  const index = browser.tabSids.indexOf(sid);
  if (index < 0) return browser;
  const tabSids = browser.tabSids.filter((tab) => tab !== sid);
  if (tabSids.length === 0) return null;
  let activeTabSid = browser.activeTabSid;
  if (activeTabSid === sid) {
    activeTabSid = tabSids[Math.max(0, index - 1)] ?? tabSids[0]!;
  }
  return { ...browser, tabSids, activeTabSid };
}

export function setActiveBrowserTab(
  browser: PlaygroundBrowser,
  sid: string,
): PlaygroundBrowser {
  if (!browser.tabSids.includes(sid)) return browser;
  return { ...browser, activeTabSid: sid };
}


/** First tab in the group is the primary/main tab (no close affordance). */
export function mainTabSid(browser: PlaygroundBrowser): string {
  return browser.tabSids[0]!;
}

export function isMainBrowserTab(
  browser: PlaygroundBrowser,
  sid: string,
): boolean {
  return mainTabSid(browser) === sid;
}

export function isValidBrowser(browser: unknown): browser is PlaygroundBrowser {
  if (!browser || typeof browser !== "object") return false;
  const row = browser as Record<string, unknown>;
  if (typeof row.browserId !== "string" || !row.browserId) return false;
  if (!Array.isArray(row.tabSids) || row.tabSids.length === 0) return false;
  if (!row.tabSids.every((sid) => typeof sid === "string" && sid.length > 0)) {
    return false;
  }
  if (typeof row.activeTabSid !== "string") return false;
  return row.tabSids.includes(row.activeTabSid);
}
