import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTermSessionLaunchCommand,
  keepUserClaudeLogin,
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

test("keepUserClaudeLogin rewrites hula.8 CLAUDE_CONFIG_DIR handoff lines to --mcp-config", () => {
  const line = `export BUZZ_USER_SIGNER_DIR='/a/user-signer' && export CLAUDE_CONFIG_DIR='/a/term-sessions/s1/claude-config' && cd '~/w' && claude "$(cat '/a/p.txt')"`;
  assert.equal(
    keepUserClaudeLogin(line),
    `export BUZZ_USER_SIGNER_DIR='/a/user-signer' && cd '~/w' && claude --mcp-config '/a/term-sessions/s1/claude-config/.claude.json' "$(cat '/a/p.txt')"`,
  );
  assert.equal(
    keepUserClaudeLogin(`export CLAUDE_CONFIG_DIR='/x y' && claude "$(cat '/p')"`),
    `claude --mcp-config '/x y/.claude.json' "$(cat '/p')"`,
  );
  const fresh = `claude --mcp-config '/s/mcp.json' "$(cat '/p')"`;
  assert.equal(keepUserClaudeLogin(fresh), fresh);
  assert.equal(keepUserClaudeLogin(`codex "$(cat '/p')"`), `codex "$(cat '/p')"`);
});

test("builds claude launch with --mcp-config", () => {
  const cmd = buildTermSessionLaunchCommand({ tool: "claude", promptPath: "/p", mcpConfigPath: "/s/mcp.json" });
  assert.equal(cmd, `claude --mcp-config '/s/mcp.json' "$(cat '/p')"`);
});
