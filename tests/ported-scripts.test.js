// Tests for scripts ported from sibling project repos into the do plugin:
//   #1 commit-doctor module      (do/modules/commit-doctor/)
//   #2 codebase-cartography      (skills/codebase-cartography/scripts/map_codebase_structure.py)
//   #5 check-search-tools        (tools/check-search-tools.sh)
const { test } = require("node:test");
const assert = require("node:assert");
const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const { join } = require("node:path");
const { mkdtempSync, writeFileSync, existsSync, readFileSync } = fs;
const { tmpdir } = require("node:os");
const { bashEnv, bashPath, repoRoot: ROOT } = require("./bash-paths");


function pickPython() {
  for (const exe of ["python", "python3"]) {
    const r = spawnSync(exe, ["--version"], { encoding: "utf8" });
    if (r.status === 0 || (r.stdout || r.stderr || "").toLowerCase().includes("python")) return exe;
  }
  return null;
}

// ---- wiring: plugin.json registers the commit-doctor PostToolUse hook ----
test("plugin.json registers the commit-doctor PostToolUse hook (cleanup-nul removed)", () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, ".claude-plugin", "plugin.json"), "utf8"));
  const post = manifest.hooks.PostToolUse || [];
  const cmds = post.flatMap((g) => (g.hooks || []).map((h) => h.command)).join("\n");
  assert.doesNotMatch(cmds, /cleanup-nul-files\.sh/, "cleanup-nul hook removed");
  assert.match(cmds, /commit-doctor\/hooks\/commit-doctor\.sh/, "commit-doctor hook registered");
});

// ---- #1 commit-doctor: module manifest is well-formed ----
test("commit-doctor module.json is valid and points at an existing hook + format note", () => {
  const dir = join(ROOT, "do", "modules", "commit-doctor");
  const mod = JSON.parse(readFileSync(join(dir, "module.json"), "utf8"));
  assert.equal(mod.name, "commit-doctor");
  assert.ok((mod.externalDeps || []).includes("jq"), "declares jq dependency");
  assert.ok(existsSync(join(dir, mod.appendFormat)), "appendFormat file exists");
  assert.ok(existsSync(join(dir, "hooks", "commit-doctor.sh")), "hook file exists");
});

test("commit-doctor hook dispatches do:commit and self-gates on the manifest", () => {
  const src = readFileSync(join(ROOT, "do", "modules", "commit-doctor", "hooks", "commit-doctor.sh"), "utf8");
  assert.match(src, /do\.manifest\.json/, "reads the project manifest");
  assert.match(src, /includes\("commit-doctor"\)/, "self-gates on its own module name");
  assert.match(src, /subagent_type:\s*\\?"do:commit\\?"/, "dispatches the do:commit agent");
  assert.doesNotMatch(src, /projects\/ttx-workspace/, "no hard-coded ttx workspace path");
});

// ---- #1 safety: hook is inert unless the module is opted in ----
test("commit-doctor hook exits 0 with no output when no manifest is present", () => {
  const proj = mkdtempSync(join(tmpdir(), "do-cd-"));
  const out = execFileSync("bash", [bashPath(join(ROOT, "do", "modules", "commit-doctor", "hooks", "commit-doctor.sh"))], {
    input: "",
    encoding: "utf8",
    env: bashEnv({ CLAUDE_PROJECT_DIR: bashPath(proj) }),
  });
  assert.equal(out, "", "no additionalContext emitted when not opted in");
});

// ---- #2 map_codebase_structure.py: emits a JSON summary with counts + languages ----
test("map_codebase_structure.py emits JSON summary with file counts and languages", () => {
  const py = pickPython();
  if (!py) { test.skip || console.log("python not found — skipping"); return; }
  const proj = mkdtempSync(join(tmpdir(), "do-map-"));
  writeFileSync(join(proj, "a.py"), "x = 1\ny = 2\n");
  writeFileSync(join(proj, "b.js"), "const z = 3;\n");
  const out = execFileSync(py, [join(ROOT, "skills", "codebase-cartography", "scripts", "map_codebase_structure.py"), proj], { encoding: "utf8" });
  const data = JSON.parse(out);
  assert.equal(data.summary.total_files, 2, "counted both files");
  const langs = Object.fromEntries(data.summary.languages);
  assert.ok(langs.Python > 0 && langs.JavaScript > 0, "tallied Python and JavaScript lines");
});

// ---- check-search-tools.sh: reports tool availability, exits 0, generalized (no GEM cruft) ----
test("check-search-tools.sh reports git as present and exits 0", () => {
  const path = join(ROOT, "tools", "check-search-tools.sh");
  const out = execFileSync("bash", [bashPath(path)], { encoding: "utf8" });
  assert.match(out, /do — tool availability/, "prints the do header");
  assert.match(out, /git\s+OK/, "git detected as present in this env");
  const src = readFileSync(path, "utf8");
  assert.doesNotMatch(src, /Search Orchestrator|requirements-search|rapidfuzz/, "GEM-specific cruft stripped");
  assert.match(src, /check_tool "jq"/, "adds do's own jq dependency");
});
