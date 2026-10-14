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
    `export BUZZ_USER_SIGNER_DIR='/a/user-signer' && cd '~/w' && claude --mcp-config='/a/term-sessions/s1/claude-config/.claude.json' -- "$(cat '/a/p.txt')"`,
  );
  assert.equal(
    keepUserClaudeLogin(`export CLAUDE_CONFIG_DIR='/x y' && claude "$(cat '/p')"`),
    `claude --mcp-config='/x y/.claude.json' -- "$(cat '/p')"`,
  );
  const fresh = `claude --mcp-config='/s/mcp.json' -- "$(cat '/p')"`;
  assert.equal(keepUserClaudeLogin(fresh), fresh);
  assert.equal(keepUserClaudeLogin(`codex "$(cat '/p')"`), `codex "$(cat '/p')"`);
});

test("builds claude launch with --mcp-config", () => {
  const cmd = buildTermSessionLaunchCommand({ tool: "claude", promptPath: "/p", mcpConfigPath: "/s/mcp.json" });
  assert.equal(cmd, `claude --mcp-config='/s/mcp.json' -- "$(cat '/p')"`);
});

test("keepUserClaudeLogin fixes mv7o3fpu space-form lines that swallowed the prompt", () => {
  assert.equal(
    keepUserClaudeLogin(`export X='1' && claude --mcp-config '/d/.claude.json' "$(cat '/p')"`),
    `export X='1' && claude --mcp-config='/d/.claude.json' -- "$(cat '/p')"`,
  );
});

test("multi-line prompt stays one positional arg, not a second --mcp-config path (real shell)", async () => {
  const { execFileSync } = await import("node:child_process");
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mcpcfg-"));
  const prompt = path.join(dir, "prompt.txt");
  fs.writeFileSync(prompt, "## Buzz as signed-in user (Term MCP)\n\nline two\n");
  // Fake `claude` that mimics commander's variadic --mcp-config: values until the next flag or `--`.
  fs.writeFileSync(path.join(dir, "claude"), `#!/bin/sh
cfg=""; pos=""
while [ $# -gt 0 ]; do case "$1" in
  --mcp-config=*) cfg="\${1#--mcp-config=}";;
  --mcp-config) shift; while [ $# -gt 0 ] && [ "\${1#-}" = "$1" ]; do cfg="$cfg|$1"; shift; done; continue;;
  --) shift; pos="$1";;
  *) pos="$1";;
esac; shift; done
printf 'CFG=%s\\nPOS=%s' "$cfg" "$pos"
`, { mode: 0o755 });
  const run = (line) => execFileSync("/bin/sh", ["-c", line], { env: { ...process.env, PATH: `${dir}:${process.env.PATH}` } }).toString();
  const out = run(buildTermSessionLaunchCommand({ tool: "claude", promptPath: prompt, mcpConfigPath: "/s/mcp.json" }));
  assert.match(out, /^CFG=\/s\/mcp\.json\nPOS=## Buzz as signed-in user/);
  const legacy = run(keepUserClaudeLogin(`export CLAUDE_CONFIG_DIR='/c' && claude "$(cat '${prompt}')"`));
  assert.match(legacy, /^CFG=\/c\/\.claude\.json\nPOS=## Buzz/);
});
