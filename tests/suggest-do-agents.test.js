// Tests for the suggest-do-agents UserPromptSubmit hook (spine, always-on) and its node helper.
// The enumeration + suppression logic is exercised on the pure-node helper (reliable cross-platform);
// the bash hook is covered for its manifest self-gate; plugin.json is checked for the wiring.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const { execFileSync } = require("node:child_process");
const { readFileSync, mkdtempSync, mkdirSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const { bashPath, bashEnv } = require("./bash-paths");

const ROOT = join(__dirname, "..");
const HELPER = join(ROOT, "tools", "suggest-do-agents.js");
const HOOK = join(ROOT, "do", "spine", "hooks", "suggest-do-agents.sh");

const runHelper = (input) => execFileSync("node", [HELPER], { input, encoding: "utf8" });

// ---- helper: enumerates the do: agents with a one-line purpose ----
test("helper lists do: agents, each with a one-line purpose", () => {
  const out = runHelper(JSON.stringify({ prompt: "add a soft-delete column to the orders table" }));
  assert.match(out, /^DO AGENTS/m, "emits the suggestion header");
  assert.match(out, /- do:distinguished-engineer — \S/, "an agent line carries a one-liner");
  assert.match(out, /- do:review\b/, "review is listed");
  for (const line of out.split("\n").filter((l) => l.startsWith("- "))) {
    assert.match(line, /^- do:[a-z][a-z0-9-]* — \S/, `bullet is 'do:<name> — <purpose>': ${line}`);
  }
});

// ---- helper: stays silent when the user already named an agent / a route ----
for (const prompt of [
  "use the review agent please",
  "do:engineer build the endpoint",
  "do-route this task",
  "which agent should handle this?",
  "do distinguished-engineer this",
]) {
  test(`helper stays silent when the prompt already chooses: ${prompt}`, () => {
    assert.equal(runHelper(JSON.stringify({ prompt })).trim(), "", "no suggestion once the user has chosen");
  });
}

// ---- helper: non-JSON stdin is treated as the raw prompt ----
test("helper falls back to raw stdin when the payload is not JSON", () => {
  assert.match(runHelper("just refactor this service"), /^DO AGENTS/m);
});

// ---- hook: no-op (silent, exit 0) when the do manifest is absent ----
test("hook no-ops when the do manifest is absent", () => {
  const proj = mkdtempSync(join(tmpdir(), "do-suggest-"));
  const out = execFileSync("bash", [bashPath(HOOK)], {
    input: JSON.stringify({ prompt: "refactor this service" }),
    encoding: "utf8",
    env: bashEnv({ CLAUDE_PROJECT_DIR: bashPath(proj) }, ["CLAUDE_PROJECT_DIR"]),
  });
  assert.equal(out.trim(), "", "silent without a .claude/do.manifest.json");
});

// ---- hook: emits the agent list when the project is opted in ----
test("hook emits the agent list when a manifest is present", () => {
  const proj = mkdtempSync(join(tmpdir(), "do-suggest-"));
  mkdirSync(join(proj, ".claude"), { recursive: true });
  writeFileSync(join(proj, ".claude", "do.manifest.json"), "{}");
  const out = execFileSync("bash", [bashPath(HOOK)], {
    input: JSON.stringify({ prompt: "refactor this service" }),
    encoding: "utf8",
    env: bashEnv({ CLAUDE_PROJECT_DIR: bashPath(proj) }, ["CLAUDE_PROJECT_DIR"]),
  });
  assert.match(out, /^DO AGENTS/m, "emits the suggestion when opted in");
});

// ---- wiring: plugin.json declares the hook on UserPromptSubmit via CLAUDE_PLUGIN_ROOT ----
test("plugin.json declares suggest-do-agents on UserPromptSubmit via CLAUDE_PLUGIN_ROOT", () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, ".claude-plugin", "plugin.json"), "utf8"));
  const cmds = (manifest.hooks.UserPromptSubmit || []).flatMap((g) => (g.hooks || []).map((h) => h.command));
  assert.ok(
    cmds.some((c) => c.includes("do/spine/hooks/suggest-do-agents.sh") && c.includes("${CLAUDE_PLUGIN_ROOT}")),
    "suggest-do-agents.sh is plugin-declared on UserPromptSubmit"
  );
});
