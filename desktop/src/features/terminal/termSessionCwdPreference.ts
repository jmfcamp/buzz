/** @deprecated Prefer `./termPreferences`. */
export {
  DEFAULT_TERM_CWD as DEFAULT_TERM_SESSION_CWD,
  TERM_PREF_KEYS,
  getTermPreferences,
  getTermSessionCwd,
  parseTermCwd as parseTermSessionCwd,
  resolveTermCwdForAttach,
  resolveTermSessionCwdForAttach,
  setTermCwd as setTermSessionCwd,
  useTermSessionCwd,
} from "./termPreferences.ts";

export const TERM_SESSION_CWD_STORAGE_KEY = "buzz.term.sessionCwd";
