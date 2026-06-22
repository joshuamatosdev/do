const { test } = require("node:test");
const assert = require("node:assert");
const { execFileSync } = require("node:child_process");
const { mkdtempSync, mkdirSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");

// do's enforcement hooks are declared in the plugin manifest, so they LOAD in every
// plugin-enabled project — including projects that never ran `/do setup`. Invariant under
// test: an enforcement hook must NO-OP (exit 0, allow) wherever the project did not opt in.
// Opt-in is signalled by .claude/do.manifest.json (written by install). The codex-integrity
// hook is module-scoped: it stays silent unless that module is recorded in manifest.modules.
// Faithful test — actually executes the bash hook; skipped where bash is unavailable.
function hasBash() { try { execFileSync("bash", ["-c", "exit 0"], { stdio: "ignore" }); return true; } catch { return false; } }
const SKIP = hasBash() ? false : "bash unavailable on this host";

const ROOT = join(__dirname, "..");
const fwd = (p) => p.replace(/\\/g, "/"); // Git Bash takes drive-letter forward-slash paths

function runHook(absRel, input, projectDir) {
  const hook = fwd(join(ROOT, absRel));
  try {
    execFileSync("bash", [hook], { input, env: { ...process.env, CLAUDE_PROJECT_DIR: fwd(projectDir) }, stdio: ["pipe", "pipe", "pipe"] });
    return { code: 0, stderr: "" };
  } catch (e) { return { code: e.status ?? 1, stderr: (e.stderr || "").toString() }; }
}
const spine = (rel, input, dir) => runHook(join("do", "spine", "hooks", rel), input, dir);
const codexHook = (input, dir) => runHook(join("do", "modules", "codex-integrity", "hooks", "codex-stop.sh"), input, dir);
const gitGate = (input, dir) => runHook(join("do", "modules", "git-gate", "hooks", "git-gate.sh"), input, dir);

function bareProject() { return mkdtempSync(join(tmpdir(), "do-bare-")); } // no manifest = never opted in
function installedProject(modules = []) {
  const t = mkdtempSync(join(tmpdir(), "do-inst-"));
  mkdirSync(join(t, ".claude"), { recursive: true });
  writeFileSync(join(t, ".claude", "do.manifest.json"), JSON.stringify({ version: "0.1.0", modules }));
  return t;
}

// Literals split so the destructive/stub strings never appear contiguously in this file.
const DESTRUCTIVE = JSON.stringify({ tool_input: { command: "git re" + "set --hard HEAD" } });
const SAFE_GIT = JSON.stringify({ tool_input: { command: "git status" } });
const STUB = JSON.stringify({ tool_input: { new_string: "x // TO" + "DO: implement" } });
const CLEAN = JSON.stringify({ tool_input: { new_string: "const x = 1;" } });

test("git-gate self-gates: a non-opted-in project (no manifest) allows destructive git (exit 0)", { skip: SKIP }, () => {
  assert.equal(gitGate(DESTRUCTIVE, bareProject()).code, 0);
});
test("git-gate is OPT-IN: an installed project WITHOUT the git-gate module allows destructive git (exit 0)", { skip: SKIP }, () => {
  assert.equal(gitGate(DESTRUCTIVE, installedProject([])).code, 0);
});
test("git-gate enforces when the module is opted in: destructive git is blocked (exit 2)", { skip: SKIP }, () => {
  const r = gitGate(DESTRUCTIVE, installedProject(["git-gate"]));
  assert.equal(r.code, 2);
  assert.match(r.stderr, /blocked by the do git gate/);
});
test("git-gate allows a safe git command when the module is opted in (exit 0)", { skip: SKIP }, () => {
  assert.equal(gitGate(SAFE_GIT, installedProject(["git-gate"])).code, 0);
});

test("block-stub-write self-gates: a non-opted-in project allows a stub write (exit 0)", { skip: SKIP }, () => {
  assert.equal(spine("block-stub-write.sh", STUB, bareProject()).code, 0);
});
test("block-stub-write enforces in an opted-in project: a stub write is blocked (exit 2)", { skip: SKIP }, () => {
  assert.equal(spine("block-stub-write.sh", STUB, installedProject()).code, 2);
});
test("block-stub-write allows clean content in an opted-in project (exit 0)", { skip: SKIP }, () => {
  assert.equal(spine("block-stub-write.sh", CLEAN, installedProject()).code, 0);
});

test("codex-integrity review is silent in a non-opted-in project (no manifest)", { skip: SKIP }, () => {
  const r = codexHook("{}", bareProject());
  assert.equal(r.code, 0);
  assert.equal(r.stderr.trim(), "", "no advisory where do was never installed");
});
test("codex-integrity review is silent when the module is not in manifest.modules", { skip: SKIP }, () => {
  const r = codexHook("{}", installedProject([]));
  assert.equal(r.code, 0);
  assert.equal(r.stderr.trim(), "", "module-scoped: silent unless codex-integrity is recorded as installed");
});
