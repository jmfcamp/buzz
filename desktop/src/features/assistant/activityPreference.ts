import * as React from "react";

// Device preference for showing agent activity rows inside the Assistant popup (default off, like desktop).
const KEY = "buzz-assistant-show-activity.v1";
const EVENT = "buzz-assistant-show-activity";

function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setAssistantShowActivity(on: boolean): void {
  try {
    window.localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    /* UI preference only */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function useAssistantShowActivity(): boolean {
  return React.useSyncExternalStore(
    (cb) => {
      window.addEventListener(EVENT, cb);
      window.addEventListener("storage", cb);
      return () => {
        window.removeEventListener(EVENT, cb);
        window.removeEventListener("storage", cb);
      };
    },
    read,
    () => false,
  );
}
