const { test } = require("node:test");
const assert = require("node:assert");
const { mkdtempSync, mkdirSync, readFileSync, existsSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");

// Real plugin root (real spine), so install writes its genuine artifacts and remove reverses them.
delete process.env.DO_PLUGIN_ROOT;
const { install } = require("../lib/install");
const { remove } = require("../lib/uninstall");

function tmpTarget() { return mkdtempSync(join(tmpdir(), "do-uninstall-")); }

test("strips the do-managed CLAUDE.md block and preserves surrounding content", () => {
  const t = tmpTarget();
  writeFileSync(join(t, "CLAUDE.md"), "# My project\nExisting rules.\n");
  install({ target: t, modules: [] });
  const installed = readFileSync(join(t, "CLAUDE.md"), "utf8");
  assert.ok(installed.includes("DO:BEGIN"), "precondition: managed block installed");

  const r = remove({ target: t });
  assert.ok(r.claudeBlockRemoved, "result reports the block was removed");
  const after = readFileSync(join(t, "CLAUDE.md"), "utf8");
  assert.ok(!after.includes("DO:BEGIN"), "managed block gone");
  assert.ok(!after.includes("DO:END"), "managed block end marker gone");
  assert.ok(after.includes("# My project"), "user heading preserved");
  assert.ok(after.includes("Existing rules."), "user content preserved");
});

test("strips do-owned hooks and env from settings.json (no pre-do .bak)", () => {
  // A settings.json that did NOT exist pre-do: install creates it with no .bak. Seed it with a
  // do-owned hook + env so the strip has something to remove, plus a user key that must survive.
  const t = tmpTarget();
  install({ target: t, modules: [] });
  const sp = join(t, ".claude", "settings.json");
  writeFileSync(sp, JSON.stringify({
    model: "opus",
    hooks: {
      SessionStart: [{ hooks: [
        { type: "command", command: "user.sh" },
        { type: "command", command: "X/do-hook.sh", _do: true },
      ] }],
    },
    env: { USER_KEY: "keep", DO_FLAG: "1" },
    _doEnv: { DO_FLAG: "1" },
  }, null, 2));

  remove({ target: t });
  const s = JSON.parse(readFileSync(sp, "utf8"));
  const cmds = (s.hooks.SessionStart || []).flatMap((g) => g.hooks.map((h) => h.command));
  assert.deepEqual(cmds, ["user.sh"], "do hook stripped, user hook kept");
  assert.equal(s.model, "opus", "unrelated top-level key preserved");
  assert.equal(s.env.USER_KEY, "keep", "user env key preserved");
  assert.ok(!("DO_FLAG" in s.env), "do-ledgered env key stripped");
  assert.ok(!("_doEnv" in s), "internal do-env ledger cleared");
});

test("strips an UNTAGGED do hook that references a removed do hook file (pre-tag migration)", () => {
  // A pre-tag install could leave an untagged do hook (e.g. codex-later before its partial tagged
  // `_do: true`). mergeSettings strips only `_do`-tagged hooks, so without a file-reference strip the
  // untagged hook would survive uninstall and then point at the script we just removed — a broken
  // Stop hook every turn. Removal must strip any hook whose command references a do-installed file.
  const t = tmpTarget();
  install({ target: t, modules: [] });
  const sp = join(t, ".claude", "settings.json");
  const s = JSON.parse(readFileSync(sp, "utf8"));
  s.hooks = s.hooks || {};
  s.hooks.Stop = [{ hooks: [
    { type: "command", command: "user-own.sh" },
    { type: "command", command: 'bash "$CLAUDE_PROJECT_DIR/.claude/hooks/codex-later-stop.sh"' }, // untagged legacy do hook
  ] }];
  writeFileSync(sp, JSON.stringify(s, null, 2));
  // Record the hook file in the manifest so removal treats it as a do-installed file it removes.
  const mp = join(t, ".claude", "do.manifest.json");
  const m = JSON.parse(readFileSync(mp, "utf8"));
  m.files[".claude/hooks/codex-later-stop.sh"] = "deadbeef00000000";
  writeFileSync(mp, JSON.stringify(m, null, 2));

  remove({ target: t });
  const after = JSON.parse(readFileSync(sp, "utf8"));
  const stop = (after.hooks && after.hooks.Stop) ? after.hooks.Stop.flatMap((g) => g.hooks.map((h) => h.command)) : [];
  assert.ok(!stop.some((c) => c.includes("codex-later-stop.sh")), "untagged do hook referencing a removed file is stripped");
  assert.ok(stop.includes("user-own.sh"), "unrelated user hook preserved");
});

test("restores settings.json.bak (the pre-do original) when present", () => {
  // A settings.json that existed pre-do: install backs it up to .bak, then merges. Remove must
  // restore the verbatim pre-do original and drop the backup.
  const t = tmpTarget();
  const claude = join(t, ".claude"); mkdirSync(claude, { recursive: true });
  const sp = join(claude, "settings.json");
  const original = JSON.stringify({ model: "sonnet", custom: "pre-do-user-value" });
  writeFileSync(sp, original);
  install({ target: t, modules: [] });
  assert.ok(existsSync(sp + ".bak"), "precondition: install made a .bak");

  const r = remove({ target: t });
  assert.equal(r.settings, "restored-from-bak");
  assert.equal(readFileSync(sp, "utf8"), original, "settings.json restored to the verbatim pre-do original");
  assert.ok(!existsSync(sp + ".bak"), "backup consumed on restore");
});

test("removes the manifest and the do-installed spine files", () => {
  const t = tmpTarget();
  install({ target: t, modules: [] });
  assert.ok(existsSync(join(t, ".claude", "do.manifest.json")), "precondition: manifest present");
  assert.ok(existsSync(join(t, ".claude", "RESPONSE-FORMAT.md")), "precondition: spine file present");
  assert.ok(existsSync(join(t, ".claude", "do", "execution-policy.yaml")), "precondition: spine file present");

  remove({ target: t });
  assert.ok(!existsSync(join(t, ".claude", "do.manifest.json")), "manifest removed");
  assert.ok(!existsSync(join(t, ".claude", "do.config.json")), "do config removed");
  assert.ok(!existsSync(join(t, ".claude", "RESPONSE-FORMAT.md")), "spine file removed");
  assert.ok(!existsSync(join(t, ".claude", "do", "execution-policy.yaml")), "nested spine file removed");
  assert.ok(!existsSync(join(t, ".claude", "capability-gate.md")), "spine file removed");
});

test("removes module-installed files recorded in the manifest", () => {
  const t = tmpTarget();
  install({ target: t, modules: ["memory-discipline"] });
  const moduleFile = join(t, ".claude", "skills", "do-remember", "SKILL.md");
  assert.ok(existsSync(moduleFile), "precondition: module file installed");

  remove({ target: t });
  assert.ok(!existsSync(moduleFile), "module file removed via manifest record");
});

test("running remove twice is idempotent", () => {
  const t = tmpTarget();
  writeFileSync(join(t, "CLAUDE.md"), "# Keep me\n");
  install({ target: t, modules: [] });

  const first = remove({ target: t });
  const second = remove({ target: t });

  assert.ok(first.removedFiles.length > 0, "first removal did work");
  assert.deepEqual(second.removedFiles, [], "second removal finds nothing left to remove");
  assert.equal(second.claudeBlockRemoved, false, "no block to strip on the second pass");
  assert.equal(second.settings, "untouched", "settings already gone — nothing to do");
  assert.equal(readFileSync(join(t, "CLAUDE.md"), "utf8"), "# Keep me\n", "user CLAUDE.md content stable across both passes");
});

test("removes a do-only CLAUDE.md (file install created) entirely", () => {
  // No pre-existing CLAUDE.md: install writes one containing only the managed block.
  // Removal leaves nothing of the user's, so the file itself is removed.
  const t = tmpTarget();
  install({ target: t, modules: [] });
  assert.ok(existsSync(join(t, "CLAUDE.md")), "precondition: install created CLAUDE.md");

  remove({ target: t });
  assert.ok(!existsSync(join(t, "CLAUDE.md")), "do-only CLAUDE.md removed");
});

test("remove is safe when nothing was ever installed", () => {
  const t = tmpTarget();
  const r = remove({ target: t });
  assert.equal(r.installed, false, "reports no manifest was found");
  assert.deepEqual(r.removedFiles, [], "nothing removed");
  assert.equal(r.claudeBlockRemoved, false);
  assert.equal(r.settings, "untouched");
});
