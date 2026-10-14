import assert from "node:assert/strict";
import test from "node:test";

import { buildLaunchFromPrepare } from "./prepareLaunch.ts";

test("buildLaunchFromPrepare keeps the user Claude login: --mcp-config, no CLAUDE_CONFIG_DIR", () => {
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
  assert.equal(extraEnv.CLAUDE_CONFIG_DIR, undefined);
  assert.equal(extraEnv.BUZZ_USER_SIGNER_DIR, "/tmp/user-signer");
  assert.doesNotMatch(launchCommand, /CLAUDE_CONFIG_DIR/);
  assert.match(launchCommand, /claude --mcp-config='\/tmp\/claude-sid\/\.claude\.json' -- /);
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

test("buildLaunchFromPrepare prefers mcpConfigPath", () => {
  const { launchCommand } = buildLaunchFromPrepare(
    { hula: "term-session", v: 1, name: "t", tool: "claude", sid: "s", prompt: "hi" },
    { promptPath: "/p", claudeConfigDir: null, mcpConfigPath: "/s/mcp.json", openclawWired: false },
  );
  assert.equal(launchCommand, `claude --mcp-config='/s/mcp.json' -- "$(cat '/p')"`);
});
