import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTermSessionLaunchCommand,
  shellSingleQuote,
} from "./launchCommand.ts";

test("shellSingleQuote escapes embedded single quotes", () => {
  assert.equal(shellSingleQuote("a'b"), `'a'"'"'b'`);
});

test("builds claude interactive launch with optional cwd and config dir", () => {
  const cmd = buildTermSessionLaunchCommand({
    tool: "claude",
    promptPath: "/tmp/p.txt",
    cwd: "~/work",
    claudeConfigDir: "/tmp/claude-sid",
  });
  assert.match(cmd, /export CLAUDE_CONFIG_DIR='\/tmp\/claude-sid'/);
  assert.match(cmd, /cd '~\/work'/);
  assert.match(cmd, /claude "\$\(cat '\/tmp\/p\.txt'\)"/);
  assert.doesNotMatch(cmd, / -p /);
  assert.doesNotMatch(cmd, /claude-agent-acp/);
});

test("builds codex interactive launch without ACP adapter", () => {
  const cmd = buildTermSessionLaunchCommand({
    tool: "codex",
    promptPath: "/tmp/p.txt",
  });
  assert.match(cmd, /^codex "\$\(cat '\/tmp\/p\.txt'\)"$/);
  assert.doesNotMatch(cmd, /codex-acp/);
});
