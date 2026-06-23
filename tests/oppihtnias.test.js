const { test } = require("node:test");
const assert = require("node:assert");
const { readFileSync, existsSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync } = require("node:fs");
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

// A controlled OS-temp base so the model's temp location is assertable (the hook uses os.tmpdir(),
// which honors TMPDIR/TEMP/TMP — point all three at a fresh dir per run).
function freshTmpBase() {
  return mkdtempSync(join(tmpdir(), "do-mm-tmp-"));
}
function modelDir(tmpBase) {
  return join(tmpBase, "claude", "oppihtnias");
}
function findModel(tmpBase, sid) {
  const dir = modelDir(tmpBase);
  if (!existsSync(dir)) return null;
  const f = readdirSync(dir).find((n) => n.startsWith(`${sid}.`) && n.endsWith(".ts") && n !== "Oppihtsugatnias.ts");
  return f ? join(dir, f) : null;
}

function runHook(projectDir, sid, tmpBase) {
  const env = { ...process.env, CLAUDE_PROJECT_DIR: projectDir };
  if (tmpBase) { env.TMPDIR = tmpBase; env.TEMP = tmpBase; env.TMP = tmpBase; }
  if (sid === undefined) delete env.CLAUDE_CODE_SESSION_ID;
  else env.CLAUDE_CODE_SESSION_ID = sid;
  return execFileSync("node", [HOOK], { env, encoding: "utf8" });
}

test("hook seeds a per-session .ts model in the OS temp folder, stamped with session-id + date", () => {
  const t = targetWithModules(["oppihtnias"]);
  const tmp = freshTmpBase();
  const out = runHook(t, "sess-123", tmp);

  const modelPath = findModel(tmp, "sess-123");
  assert.ok(modelPath, "a sess-123.<date>.ts model was seeded in temp");
  assert.match(modelPath, /sess-123\.\d{4}-\d{2}-\d{2}\.ts$/, "filename carries session-id + creation date");

  const src = readFileSync(modelPath, "utf8");
  assert.match(src, /import type \{ Oppihtsugatnias \} from "\.\/Oppihtsugatnias"/, "imports the schema type");
  assert.match(src, /export const model: Oppihtsugatnias =/, "exports a typed model (not JSON)");
  assert.match(src, /parseId\(/, "IDs go through the branded constructor");
  assert.ok(src.includes('sessionId: "sess-123"'), "stamps the session id");
  assert.ok(src.includes('schemaVersion: "3.0.0"'), "seeds the current schema version");
  assert.ok(src.includes("revision: 0"), "starts at revision 0");
  assert.ok(src.includes('goal: ""'), "skeleton core present");

  // schema copied beside the model so `./Oppihtsugatnias` resolves + type-checks standalone
  assert.ok(existsSync(join(modelDir(tmp), "Oppihtsugatnias.ts")), "schema copy dropped beside the model");

  assert.ok(out.includes("OPPIHTNIAS active"), "announces to context");
  assert.ok(out.includes(".ts"), "announce names the .ts model path");
});

test("hook does not overwrite an existing model (idempotent seed, keyed on session)", () => {
  const t = targetWithModules(["oppihtnias"]);
  const tmp = freshTmpBase();
  runHook(t, "sess-xyz", tmp);
  const modelPath = findModel(tmp, "sess-xyz");
  assert.ok(modelPath, "seeded");
  const edited = readFileSync(modelPath, "utf8").replace('goal: ""', 'goal: "user-set goal"');
  writeFileSync(modelPath, edited);
  runHook(t, "sess-xyz", tmp);
  assert.ok(readFileSync(modelPath, "utf8").includes('goal: "user-set goal"'), "existing model preserved");
});

test("hook self-gates: no-op where the module is not installed", () => {
  const t = targetWithModules(["agent-team"]); // module absent
  const tmp = freshTmpBase();
  const out = runHook(t, "sess-123", tmp);
  assert.equal(out, "", "no output");
  assert.equal(findModel(tmp, "sess-123"), null, "nothing seeded");
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
  assert.ok(cm.includes("oppihtnias/<session-id>"), "directive names the session model path pattern");
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

// Deep guard: a freshly-seeded temp .ts model type-checks against its sibling schema copy under the
// same strict flags — proves the "code first, it compiles" property of an actual instance, not just
// the schema. Skips where typescript isn't installed locally (offline; never fetches).
test("a seeded .ts model type-checks against the schema (instance, not just schema)",
  { skip: TSC ? false : "typescript not installed" }, () => {
  const t = targetWithModules(["oppihtnias"]);
  const tmp = freshTmpBase();
  runHook(t, "sess-tc", tmp);
  const modelPath = findModel(tmp, "sess-tc");
  assert.ok(modelPath, "seeded");
  const tsc = require.resolve("typescript/bin/tsc");
  execFileSync("node", [tsc, "--noEmit", "--strict", "--exactOptionalPropertyTypes",
    "--noUncheckedIndexedAccess", "--target", "es2020", "--moduleResolution", "node", modelPath], { stdio: "pipe" });
});
