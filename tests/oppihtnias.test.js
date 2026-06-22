const { test } = require("node:test");
const assert = require("node:assert");
const { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { execFileSync } = require("node:child_process");
const { tmpdir } = require("node:os");

const ROOT = join(__dirname, "..");
const MOD = join(ROOT, "do", "modules", "oppihtnias");
const HOOK = join(MOD, "hooks", "oppihtnias-activate.js");

test("oppihtnias module.json is valid and ships the schema + format-note", () => {
  const mod = JSON.parse(readFileSync(join(MOD, "module.json"), "utf8"));
  assert.equal(mod.name, "oppihtnias");
  assert.deepEqual(mod.externalDeps, [], "advisory — no external deps");
  assert.ok(existsSync(join(MOD, mod.appendFormat)), "format-note exists");
  assert.ok(mod.files.some(([src]) => src === "Oppihtsugatnias.ts"), "ships the schema type");
  assert.ok(existsSync(join(MOD, "Oppihtsugatnias.ts")), "schema file present");
  assert.equal(mod.appendClaude, "claude-note.md", "ships an inherited CLAUDE.md note (reaches subagents)");
  assert.ok(existsSync(join(MOD, "claude-note.md")), "claude-note exists");
});

test("the SessionStart hook is registered in plugin.json", () => {
  const pj = JSON.parse(readFileSync(join(ROOT, ".claude-plugin", "plugin.json"), "utf8"));
  const cmds = (pj.hooks.SessionStart || []).flatMap((g) => (g.hooks || []).map((h) => h.command));
  assert.ok(cmds.some((c) => c.includes("oppihtnias/hooks/oppihtnias-activate.js")), "hook wired");
});

// Build a target project whose manifest lists (or omits) the module, run the hook, observe.
function targetWithModules(modules) {
  const t = mkdtempSync(join(tmpdir(), "do-mm-"));
  mkdirSync(join(t, ".claude"), { recursive: true });
  writeFileSync(join(t, ".claude", "do.manifest.json"), JSON.stringify({ version: "0.0.0", modules }));
  return t;
}

function runHook(projectDir, sid) {
  const env = { ...process.env, CLAUDE_PROJECT_DIR: projectDir };
  if (sid === undefined) delete env.CLAUDE_CODE_SESSION_ID;
  else env.CLAUDE_CODE_SESSION_ID = sid;
  return execFileSync("node", [HOOK], { env, encoding: "utf8" });
}

test("hook seeds a per-session model where the module is installed", () => {
  const t = targetWithModules(["oppihtnias"]);
  const out = runHook(t, "sess-123");
  const modelPath = join(t, ".claude", "state", "oppihtnias", "sess-123.json");
  assert.ok(existsSync(modelPath), "model JSON seeded");
  const m = JSON.parse(readFileSync(modelPath, "utf8"));
  assert.equal(m.provenance.sessionId, "sess-123");
  assert.equal(m.provenance.revision, 0);
  assert.equal(m.provenance.schemaVersion, "3.0.0", "seeds the current schema version");
  assert.equal(m.core.goal, "", "skeleton core present");
  assert.ok(out.includes("OPPIHTNIAS active"), "announces to context");
});

test("hook does not overwrite an existing model (idempotent seed)", () => {
  const t = targetWithModules(["oppihtnias"]);
  runHook(t, "sess-xyz");
  const modelPath = join(t, ".claude", "state", "oppihtnias", "sess-xyz.json");
  const edited = JSON.parse(readFileSync(modelPath, "utf8"));
  edited.core.goal = "user-set goal";
  writeFileSync(modelPath, JSON.stringify(edited));
  runHook(t, "sess-xyz");
  assert.equal(JSON.parse(readFileSync(modelPath, "utf8")).core.goal, "user-set goal", "existing model preserved");
});

test("hook self-gates: no-op where the module is not installed", () => {
  const t = targetWithModules(["agent-team"]); // module absent
  const out = runHook(t, "sess-123");
  assert.equal(out, "", "no output");
  assert.equal(existsSync(join(t, ".claude", "state", "oppihtnias")), false, "nothing seeded");
});

// The "all agents use it" mechanism: install lands the directive in CLAUDE.md, which EVERY
// agent (main loop + dispatched subagents) inherits -- unlike the SessionStart hook / format-note
// which reach only the main session.
test("install lands the inherited CLAUDE.md directive so subagents adopt the model", () => {
  const { install } = require("../lib/install");
  const t = mkdtempSync(join(tmpdir(), "do-mm-claude-"));
  install({ target: t, modules: ["oppihtnias"] });
  const cm = readFileSync(join(t, "CLAUDE.md"), "utf8");
  assert.ok(cm.includes("DO-MODULE-CLAUDE:oppihtnias:BEGIN"), "module CLAUDE block present");
  assert.ok(cm.includes(".claude/state/oppihtnias/"), "directive names the session model path");
  assert.ok(cm.includes("Dispatch hand-off"), "directive carries the dispatch hand-off rule");
  // idempotent: a second install (e.g. update) does not duplicate the block
  install({ target: t, modules: ["oppihtnias"] });
  const cm2 = readFileSync(join(t, "CLAUDE.md"), "utf8");
  assert.equal((cm2.match(/DO-MODULE-CLAUDE:oppihtnias:BEGIN/g) || []).length, 1, "block not duplicated on re-install");
  // DISABLE: reinstall WITHOUT the module must strip its inherited block, or the all-agents
  // directive lingers after the module is turned off (lifecycle: a module must be turnable-off).
  install({ target: t, modules: [] });
  const cm3 = readFileSync(join(t, "CLAUDE.md"), "utf8");
  assert.ok(!cm3.includes("DO-MODULE-CLAUDE:oppihtnias"), "reinstall without the module strips its CLAUDE block");
});

// Guard the soundness invariants the 3.0.0 redesign established so they can't silently regress to
// the weak 2.0.0 shape. Fast + offline (string checks); the tsc test below is the deeper, optional pass.
test("schema 3.0.0 keeps the sound invariants (no regression to the weak shape)", () => {
  const src = readFileSync(join(MOD, "Oppihtsugatnias.ts"), "utf8");
  assert.ok(/declare const brand:\s*unique symbol/.test(src), "required unique-symbol brand present");
  assert.ok(!/__brand\?/.test(src), "no optional `__brand?` (raw strings must not pass as Ids)");
  assert.ok(src.includes("ExtensionBag"), "JSON-safe ExtensionBag present");
  assert.ok(!/extensions\?:\s*Record<string,\s*unknown>/.test(src), "extensions field is not Record<string, unknown>");
  assert.ok(src.includes("UnitInterval"), "UnitInterval (0..1) present");
  assert.ok(src.includes("TaskState") && src.includes("CriterionEvaluation"), "discriminated task/criterion state");
  assert.ok(/schemaVersion:\s*"3\.0\.0"/.test(src), "schema pinned to 3.0.0");
  assert.ok(src.includes("parentId"), "flat hierarchy via parentId");
  assert.ok(!/children\?:\s*(readonly\s+)?Task\[\]/.test(src), "no recursive Task.children topology");
});

// Deep guard: full type-check under the strict flags — runs only where a TypeScript compiler
// resolves locally (skips offline / where typescript isn't installed; never fetches from the network).
let TSC = false;
try { require.resolve("typescript/bin/tsc"); TSC = true; } catch { TSC = false; }
test("schema 3.0.0 type-checks under strict flags", { skip: TSC ? false : "typescript not installed" }, () => {
  const tsc = require.resolve("typescript/bin/tsc");
  execFileSync("node", [tsc, "--noEmit", "--strict", "--exactOptionalPropertyTypes",
    "--noUncheckedIndexedAccess", "--target", "es2020", join(MOD, "Oppihtsugatnias.ts")], { stdio: "pipe" });
});
