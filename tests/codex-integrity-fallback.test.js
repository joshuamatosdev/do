const { test } = require("node:test");
const assert = require("node:assert");
const { execFileSync } = require("node:child_process");
const { mkdtempSync, mkdirSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const { bashEnv, bashPath, repoRoot: ROOT } = require("./bash-paths");

// codex-integrity Stop hook (advisory fallback path): self-gates on .claude/do.manifest.json
// modules. Adversarial mode is ON by default, which SILENCES this advisory; so to exercise the
// advisory path these tests pin adversarial mode OFF (a "off" flag in CLAUDE_CONFIG_DIR). With the
// advisory active and the codex CLI on PATH it routes to Codex; when codex is ABSENT it names the
// in-session do:change-skeptic agent so an integrity-watchlist turn is never left unreviewed.
// Module OFF -> silent. All PATH/tmp logic runs INSIDE bash (native MSYS paths), so only bash
// itself must be resolvable from the inherited env. Skipped where bash/node are absent.
function has(bin) { try { execFileSync("bash", ["-lc", "command -v " + bin], { stdio: "ignore" }); return true; } catch { return false; } }
const SKIP = !has("bash") ? "bash unavailable" : (!has("node") ? "node unavailable" : false);

const HOOK = bashPath(join(ROOT, "do", "modules", "codex-integrity", "hooks", "codex-stop.sh"));

function bashNodeDir() {
  return execFileSync("bash", ["-lc", 'dirname "$(command -v node)"'], { encoding: "utf8" }).trim();
}

// Run the hook in a fresh temp project. `codex` true -> drop a fake codex on PATH; false -> a PATH
// that has node + coreutils but NO codex. `adv` "off" -> write the off-flag so the advisory path is
// active (default); "default" -> no flag, so adversarial mode is ON and the advisory is silent.
function run(modulesJson, codex, adv = "off") {
  const t = mkdtempSync(join(tmpdir(), "do-codex-fallback-"));
  const proj = join(t, "proj");
  const bin = join(t, "bin");
  const cfg = join(t, "cfg");
  mkdirSync(join(proj, ".claude"), { recursive: true });
  mkdirSync(bin, { recursive: true });
  mkdirSync(cfg, { recursive: true });
  if (adv === "off") writeFileSync(join(cfg, ".do-codex-adversarial-active"), "off");
  writeFileSync(join(proj, ".claude", "do.manifest.json"), modulesJson);
  if (codex) writeFileSync(join(bin, "codex"), "#!/bin/sh\nexit 0\n");

  const launcher = join(t, "run-hook.sh");
  writeFileSync(launcher, [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    codex ? `chmod +x '${bashPath(join(bin, "codex"))}'` : ":",
    `export PATH='${bashPath(bin)}':'${bashNodeDir()}':/usr/bin:/bin`,
    `export CLAUDE_CONFIG_DIR='${bashPath(cfg)}'`,
    `export CLAUDE_PROJECT_DIR='${bashPath(proj)}'`,
    `bash '${HOOK}' 2>&1`,
    "",
  ].join("\n"));
  return execFileSync("bash", [bashPath(launcher)], { encoding: "utf8" });
}

test("advisory (adversarial OFF) + module ON + codex ABSENT -> names the do:change-skeptic fallback", { skip: SKIP }, () => {
  const out = run('{"modules":["codex-integrity"]}', false);
  assert.match(out, /codex NOT on PATH/);
  assert.match(out, /do:change-skeptic/);
});

test("advisory (adversarial OFF) + module ON + codex PRESENT -> route to Codex, name do:change-skeptic on failure", { skip: SKIP }, () => {
  const out = run('{"modules":["codex-integrity"]}', true);
  assert.match(out, /Codex integrity review/);
  assert.match(out, /do:change-skeptic/);
});

test("module OFF -> silent (no review named)", { skip: SKIP }, () => {
  const out = run('{"modules":[]}', false);
  assert.equal(out.trim(), "");
});

test("adversarial ON (default) -> advisory hook stays silent even with module + codex", { skip: SKIP }, () => {
  // No off-flag: adversarial mode is ON by default, so the advisory reminder must NOT fire
  // (codex-stop.sh is the executor in that state).
  const out = run('{"modules":["codex-integrity"]}', true, "default");
  assert.equal(out.trim(), "");
});
