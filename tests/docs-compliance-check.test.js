const { test } = require("node:test");
const assert = require("node:assert");
const { execFileSync } = require("node:child_process");
const { mkdtempSync, mkdirSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");

// PreToolUse(Edit|Write|MultiEdit) hook docs-compliance-check.sh (@docscheck): in a do-installed
// project that has a grounded-docs index, the FIRST governed edit of a session is held once (exit 2)
// with a directive to verify the code against the registered reference/spec; later edits in that
// session pass; projects with no manifest or no index are no-ops. Faithful test -- runs the bash hook.
function has(bin) { try { execFileSync("bash", ["-c", `command -v ${bin}`], { stdio: "ignore" }); return true; } catch { return false; } }
const SKIP = !has("bash") ? "bash unavailable" : false;

const ROOT = join(__dirname, "..");
const fwd = (p) => p.replace(/\\/g, "/");
const HOOK = fwd(join(ROOT, "do", "spine", "hooks", "docs-compliance-check.sh"));

function project({ manifest = true, index = true, home = "agent-docs" } = {}) {
  const t = mkdtempSync(join(tmpdir(), "do-docscheck-"));
  mkdirSync(join(t, ".claude"), { recursive: true });
  if (manifest) writeFileSync(join(t, ".claude", "do.manifest.json"), JSON.stringify({ version: "test", modules: [] }));
  if (index) { mkdirSync(join(t, home), { recursive: true }); writeFileSync(join(t, home, "grounded-docs.mjs"), "// grounded-docs CLI"); }
  return t;
}

// Run the hook; normalize execFileSync's throw-on-nonzero into { status, stderr }.
function run(dir, sid = "s1") {
  const input = JSON.stringify({ session_id: sid, tool_name: "Edit", tool_input: { file_path: "x.ts", old_string: "a", new_string: "b" }, cwd: fwd(dir) });
  try {
    const out = execFileSync("bash", [HOOK], { input, env: { ...process.env, CLAUDE_PROJECT_DIR: fwd(dir) } });
    return { status: 0, stderr: "" };
  } catch (e) {
    return { status: e.status, stderr: (e.stderr || "").toString() };
  }
}

test("first governed edit in an indexed do project -> held once (exit 2 + docscheck directive)", { skip: SKIP }, () => {
  const d = project();
  const r = run(d, "sessA");
  assert.equal(r.status, 2, "first governed edit must be held");
  assert.match(r.stderr, /docscheck/i, "directive names the docscheck rule");
  assert.match(r.stderr, /ALWAYS-READ\.md/, "directive points to ALWAYS-READ.md");
  assert.match(r.stderr, /grounded-docs\.mjs/, "directive names the lookup command");
});

test("the canonical grounded-docs/ index home also triggers the gate", { skip: SKIP }, () => {
  assert.equal(run(project({ home: "grounded-docs" }), "sessGD").status, 2, "grounded-docs/ is recognized like agent-docs/");
});

test("second edit in the same session -> ALLOW (fires once per session)", { skip: SKIP }, () => {
  const d = project();
  assert.equal(run(d, "sessB").status, 2, "first holds");
  assert.equal(run(d, "sessB").status, 0, "second passes -- marker set");
});

test("a different session -> held again (per-session marker)", { skip: SKIP }, () => {
  const d = project();
  assert.equal(run(d, "sessC").status, 2);
  assert.equal(run(d, "sessD").status, 2, "a new session is held once too");
});

test("no grounded-docs index -> no-op ALLOW (nothing to enforce)", { skip: SKIP }, () => {
  assert.equal(run(project({ index: false })).status, 0);
});

test("not a do-installed project (no manifest) -> no-op ALLOW", { skip: SKIP }, () => {
  assert.equal(run(project({ manifest: false })).status, 0);
});
