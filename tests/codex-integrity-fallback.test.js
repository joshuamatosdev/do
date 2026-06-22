const { test } = require("node:test");
const assert = require("node:assert");
const { execFileSync } = require("node:child_process");
const { join } = require("node:path");

// codex-integrity Stop hook (advisory fallback path): self-gates on .claude/do.manifest.json
// modules. Adversarial mode is ON by default, which SILENCES this advisory; so to exercise the
// advisory path these tests pin adversarial mode OFF (a "off" flag in CLAUDE_CONFIG_DIR). With the
// advisory active and the codex CLI on PATH it routes to Codex; when codex is ABSENT it names the
// in-session do:change-skeptic agent so an integrity-watchlist turn is never left unreviewed.
// Module OFF -> silent. All PATH/tmp logic runs INSIDE bash (native MSYS paths), so only bash
// itself must be resolvable from the inherited env. Skipped where bash/node are absent.
function has(bin) { try { execFileSync("bash", ["-lc", "command -v " + bin], { stdio: "ignore" }); return true; } catch { return false; } }
const SKIP = !has("bash") ? "bash unavailable" : (!has("node") ? "node unavailable" : false);

const HOOK = join(__dirname, "..", "do", "modules", "codex-integrity", "hooks", "codex-stop.sh").split(String.fromCharCode(92)).join("/");

// Run the hook in a fresh temp project. `codex` true -> drop a fake codex on PATH; false -> a PATH
// that has node + coreutils but NO codex. `adv` "off" -> write the off-flag so the advisory path is
// active (default); "default" -> no flag, so adversarial mode is ON and the advisory is silent.
// All inside bash so MSYS paths resolve.
function run(modulesJson, codex, adv = "off") {
  const mkCodex = codex ? 'printf "#!/bin/sh\nexit 0\n" > "$T/bin/codex"; chmod +x "$T/bin/codex";' : "";
  const mkFlag = adv === "off" ? ' printf off > "$T/cfg/.do-codex-adversarial-active";' : "";
  const script =
    'set -e; T=$(mktemp -d); mkdir -p "$T/.claude" "$T/bin" "$T/cfg";' +
    mkFlag +
    " printf '%s' '" + modulesJson + "' > \"$T/.claude/do.manifest.json\";" +
    " " + mkCodex +
    ' ND=$(dirname "$(command -v node)");' +
    " PATH=\"$T/bin:$ND:/usr/bin:/bin\" CLAUDE_CONFIG_DIR=\"$T/cfg\" CLAUDE_PROJECT_DIR=\"$T\" bash '" + HOOK + "' 2>&1";
  return execFileSync("bash", ["-c", script], { encoding: "utf8" });
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
  // (codex-adversarial-review.sh is the executor in that state).
  const out = run('{"modules":["codex-integrity"]}', true, "default");
  assert.equal(out.trim(), "");
});
