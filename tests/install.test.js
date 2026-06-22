const { test } = require("node:test");
const assert = require("node:assert");
const { mkdtempSync, readFileSync, existsSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const { install, stripDelimited } = require("../lib/install");

function tmpTarget() { return mkdtempSync(join(tmpdir(), "do-install-")); }

test("writes spine docs into target .claude", () => {
  const t = tmpTarget();
  install({ target: t, modules: [] });
  assert.ok(existsSync(join(t, ".claude", "RESPONSE-FORMAT.md")));
  assert.ok(existsSync(join(t, ".claude", "do", "execution-policy.yaml")));
  assert.ok(existsSync(join(t, ".claude", "do", "one.md")));
  assert.ok(existsSync(join(t, ".claude", "capability-gate.md")), "capability gate doc installed");
});

test("stripDelimited leaves text unchanged when the END marker is missing", () => {
  // Regression: an unclosed BEGIN must NOT truncate everything after it (was text.slice(0, b)).
  const body = `intro line
<!-- DO:plan:BEGIN -->
managed block, never closed
tail content that must survive`;
  assert.equal(stripDelimited(body, "DO:plan"), body);
});

test("does not inject CLAUDE_PLUGIN_ROOT hooks into target settings", () => {
  const t = tmpTarget();
  install({ target: t, modules: [] });
  const txt = readFileSync(join(t, ".claude", "settings.json"), "utf8");
  assert.ok(!txt.includes("CLAUDE_PLUGIN_ROOT"), "no CLAUDE_PLUGIN_ROOT refs in target settings — hooks live in plugin manifest");
  assert.ok(!txt.includes("load-capability-gate"), "no do doctrine hooks injected into target settings");
});

test("writes a manifest recording version + empty modules", () => {
  const t = tmpTarget();
  install({ target: t, modules: [] });
  const m = JSON.parse(readFileSync(join(t, ".claude", "do.manifest.json"), "utf8"));
  assert.ok(m.version);
  assert.deepEqual(m.modules, []);
  assert.ok(m.files[".claude/RESPONSE-FORMAT.md"], "manifest records a checksum per file by dest path");
  assert.match(m.installedAt, /^\d{4}-\d{2}-\d{2}T/, "installedAt is an ISO timestamp");
});

test("preserves existing settings.json without injecting do hooks", () => {
  const t = tmpTarget();
  const claude = join(t, ".claude"); require("node:fs").mkdirSync(claude, { recursive: true });
  writeFileSync(join(claude, "settings.json"), JSON.stringify({ model: "opus", hooks: { SessionStart: [{ hooks: [{ type: "command", command: "user.sh" }] }] } }));
  install({ target: t, modules: [] });
  const s = JSON.parse(readFileSync(join(claude, "settings.json"), "utf8"));
  const cmds = s.hooks.SessionStart.flatMap((g) => g.hooks.map((h) => h.command));
  assert.ok(cmds.includes("user.sh"), "user hook kept");
  assert.ok(!cmds.some((c) => c.includes("load-response-format.sh")), "no do hook injected into target settings");
  assert.equal(s.model, "opus");
  assert.ok(existsSync(join(claude, "settings.json.bak")), "backup created");
});

test("appends the CLAUDE.md managed block, preserving existing CLAUDE.md", () => {
  const t = tmpTarget();
  writeFileSync(join(t, "CLAUDE.md"), "# My project\nExisting rules.\n");
  install({ target: t, modules: [] });
  const c = readFileSync(join(t, "CLAUDE.md"), "utf8");
  assert.ok(c.includes("Existing rules."));
  assert.ok(c.includes("DO:BEGIN"));
});

test("is idempotent — second run does not duplicate the CLAUDE block", () => {
  const t = tmpTarget();
  install({ target: t, modules: [] });
  install({ target: t, modules: [] });
  const c = readFileSync(join(t, "CLAUDE.md"), "utf8");
  assert.equal((c.match(/DO:BEGIN/g) || []).length, 1);
});

test("rejects truly-unknown modules", () => {
  const t = tmpTarget();
  assert.throws(() => install({ target: t, modules: ["no-such-module-xyzzy"] }), /not available/i);
});

test("settings.json.bak preserves the pre-do original across re-installs", () => {
  // Regression: a re-install must NOT overwrite .bak — it would replace the genuine pre-do
  // settings with do's already-merged output, permanently losing the user's original.
  const t = tmpTarget();
  const claude = join(t, ".claude"); require("node:fs").mkdirSync(claude, { recursive: true });
  const sp = join(claude, "settings.json");
  const original = JSON.stringify({ model: "opus", custom: "user-value" });
  writeFileSync(sp, original);
  install({ target: t, modules: [] });
  assert.equal(readFileSync(sp + ".bak", "utf8"), original, "first install backs up the original verbatim");
  install({ target: t, modules: [] });
  install({ target: t, modules: [] });
  assert.equal(readFileSync(sp + ".bak", "utf8"), original, "re-installs leave the pre-do .bak untouched");
});

test("does not accumulate a leading blank-line prefix in CLAUDE.md", () => {
  // Regression: when the managed block sits at the top, stripping it left body starting with
  // newlines, baking a permanent leading blank-line prefix into CLAUDE.md on re-install.
  const t = tmpTarget();
  const cp = join(t, "CLAUDE.md");
  install({ target: t, modules: [] });
  const c0 = readFileSync(cp, "utf8");
  const b = c0.indexOf("<!-- DO:BEGIN");
  const e = c0.indexOf("<!-- DO:END -->") + "<!-- DO:END -->".length;
  // Reconstruct CLAUDE.md with the managed block FIRST, user content after.
  writeFileSync(cp, c0.slice(b, e) + "\n\n# User content\n");
  install({ target: t, modules: [] });
  const after = readFileSync(cp, "utf8");
  assert.ok(!/^\n/.test(after), "no leading blank line after re-install");
  assert.ok(after.includes("# User content"), "user content preserved");
  assert.equal((after.match(/DO:BEGIN/g) || []).length, 1, "managed block still present exactly once");
});
