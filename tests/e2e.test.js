const { test } = require("node:test");
const assert = require("node:assert");
const { mkdtempSync, readFileSync, readdirSync, statSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const { install } = require("../lib/install");

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

test("no written file contains a hardcoded absolute path", () => {
  const t = mkdtempSync(join(tmpdir(), "do-e2e-"));
  install({ target: t, modules: [] });
  const offenders = [];
  for (const f of walk(join(t, ".claude"))) {
    const text = readFileSync(f, "utf8");
    if (/\/mnt\/c\/|[A-Za-z]:\\\\projects|\/c\/projects\/ttx/.test(text)) offenders.push(f);
  }
  assert.deepEqual(offenders, [], `hardcoded paths found in: ${offenders.join(", ")}`);
});

test("target settings does NOT inject CLAUDE_PLUGIN_ROOT hooks (manifest model)", () => {
  const t = mkdtempSync(join(tmpdir(), "do-e2e2-"));
  install({ target: t, modules: [] });
  const s = readFileSync(join(t, ".claude", "settings.json"), "utf8");
  // ${CLAUDE_PLUGIN_ROOT} only resolves in plugin-declared hooks, never in a
  // target project's settings.json — so do must not inject such hooks here.
  assert.ok(!s.includes("CLAUDE_PLUGIN_ROOT"), "no CLAUDE_PLUGIN_ROOT hooks may land in target settings");
});

test("plugin manifest declares the do hooks (where CLAUDE_PLUGIN_ROOT resolves)", () => {
  const manifest = JSON.parse(readFileSync(join(__dirname, "..", ".claude-plugin", "plugin.json"), "utf8"));
  const cmds = Object.values(manifest.hooks).flatMap((groups) => groups.flatMap((g) => g.hooks.map((h) => h.command)));
  for (const sh of ["load-response-format.sh", "load-do-one.sh", "load-capability-gate.sh", "inject-response-format.sh", "protect-user-work.sh", "block-stub-write.sh", "validate-response-format.sh"]) {
    assert.ok(cmds.some((c) => c.includes(sh) && c.includes("${CLAUDE_PLUGIN_ROOT}")), `manifest declares ${sh} via plugin root`);
  }
});

test("plugin manifest declares the git-gate module hook via plugin root (self-gating, opt-in)", () => {
  const manifest = JSON.parse(readFileSync(join(__dirname, "..", ".claude-plugin", "plugin.json"), "utf8"));
  const cmds = Object.values(manifest.hooks).flatMap((groups) => groups.flatMap((g) => g.hooks.map((h) => h.command)));
  // git-gate is now an opt-in MODULE: its hook lives in do/modules/git-gate/hooks/ (plugin-declared,
  // where CLAUDE_PLUGIN_ROOT resolves) and self-gates on git-gate being in manifest.modules.
  assert.ok(cmds.some((c) => c.includes("do/modules/git-gate/hooks/git-gate.sh") && c.includes("${CLAUDE_PLUGIN_ROOT}")),
    "git-gate hook is plugin-declared from the module dir");
});

test("double install is a no-op on hook + block counts", () => {
  const t = mkdtempSync(join(tmpdir(), "do-e2e3-"));
  install({ target: t, modules: [] });
  const first = readFileSync(join(t, ".claude", "settings.json"), "utf8");
  install({ target: t, modules: [] });
  const second = readFileSync(join(t, ".claude", "settings.json"), "utf8");
  assert.equal(first, second);
});

test("installing the codex-integrity module injects NO hook into target settings (manifest model)", () => {
  const t = mkdtempSync(join(tmpdir(), "do-e2e-ci-"));
  install({ target: t, modules: ["codex-integrity"] });
  const s = readFileSync(join(t, ".claude", "settings.json"), "utf8");
  // The module used to ship a settings.partial.json that injected ${CLAUDE_PLUGIN_ROOT} into the
  // target — the same broken pattern as the spine. Its hook now lives in the plugin manifest and
  // self-gates on manifest.modules, so nothing module-specific may land in target settings.
  assert.ok(!s.includes("CLAUDE_PLUGIN_ROOT"), "module must not inject plugin-root hooks into target settings");
  assert.ok(!s.includes("codex-stop"), "module hook lives in the plugin manifest, not target settings");
  const m = JSON.parse(readFileSync(join(t, ".claude", "do.manifest.json"), "utf8"));
  assert.ok(m.modules.includes("codex-integrity"), "manifest records the module so the hook can self-gate on it");
});

test("plugin manifest declares the unified codex-stop hook via plugin root (self-gating)", () => {
  const manifest = JSON.parse(readFileSync(join(__dirname, "..", ".claude-plugin", "plugin.json"), "utf8"));
  const cmds = Object.values(manifest.hooks).flatMap((groups) => groups.flatMap((g) => g.hooks.map((h) => h.command)));
  assert.ok(cmds.some((c) => c.includes("codex-integrity/hooks/codex-stop.sh") && c.includes("${CLAUDE_PLUGIN_ROOT}")),
    "the unified codex Stop hook is plugin-declared (where CLAUDE_PLUGIN_ROOT resolves)");
  // The 3 former hooks are merged into codex-stop.sh — they must no longer be separately declared.
  assert.ok(!cmds.some((c) => c.includes("codex-adversarial-review.sh") || c.includes("codex-integrity-review.sh") || c.includes("codex-later-stop.sh")),
    "former codex Stop hooks are merged into codex-stop.sh, not separately wired");
});
