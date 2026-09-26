import assert from "node:assert/strict";
import test from "node:test";

import { buildLaunchFromPrepare } from "./prepareLaunch.ts";

test("buildLaunchFromPrepare injects CLAUDE_CONFIG_DIR and BUZZ_USER_SIGNER_DIR", () => {
  const { extraEnv, launchCommand } = buildLaunchFromPrepare(
    {
      hula: "term-session",
      v: 1,
      name: "t",
      tool: "claude",
      sid: "sid-1",
      prompt: "hi",
    },
    {
      promptPath: "/tmp/prompt.txt",
      claudeConfigDir: "/tmp/claude-sid",
      openclawWired: false,
      userSignerDir: "/tmp/user-signer",
      buzzDevMcpWired: true,
    },
  );
  assert.equal(extraEnv.CLAUDE_CONFIG_DIR, "/tmp/claude-sid");
  assert.equal(extraEnv.BUZZ_USER_SIGNER_DIR, "/tmp/user-signer");
  assert.match(launchCommand, /CLAUDE_CONFIG_DIR/);
});

test("buildLaunchFromPrepare omits signer env when not wired", () => {
  const { extraEnv } = buildLaunchFromPrepare(
    {
      hula: "term-session",
      v: 1,
      name: "t",
      tool: "claude",
      sid: "sid-2",
      prompt: "hi",
    },
    {
      promptPath: "/tmp/prompt.txt",
      claudeConfigDir: null,
      openclawWired: false,
      userSignerDir: null,
      buzzDevMcpWired: false,
    },
  );
  assert.equal(extraEnv.BUZZ_USER_SIGNER_DIR, undefined);
  assert.equal(extraEnv.CLAUDE_CONFIG_DIR, undefined);
});
