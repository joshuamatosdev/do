const { test } = require("node:test");
const assert = require("node:assert");
const { execFileSync } = require("node:child_process");
const { join } = require("node:path");
const { bashEnv, bashPath, repoRoot: ROOT } = require("./bash-paths");

// run-integrity.sh performs an integrity review with AUTOMATIC fallback: try codex; on absent /
// non-zero exit / timeout / no-DECISION, emit a SOURCE: change-skeptic directive instead. Tests
// drive each path with a fake INTEGRITY_CODEX_CMD. bash found via inherited env; skipped if absent.
function has(bin) { try { execFileSync("bash", ["-lc", "command -v " + bin], { stdio: "ignore" }); return true; } catch { return false; } }
const SKIP = !has("bash") ? "bash unavailable" : false;
const RUNNER = bashPath(join(ROOT, "do", "modules", "codex-integrity", "run-integrity.sh"));

function run(cmd, timeout, extraEnv) {
  const env = {
    INTEGRITY_CODEX_CMD: cmd,
    INTEGRITY_CODEX_TIMEOUT: String(timeout || 300),
    ...(extraEnv || {}),
  };
  return execFileSync("bash", [RUNNER], {
    env: bashEnv(env),
    encoding: "utf8",
  });
}

test("codex success (DECISION present) -> SOURCE: codex, verdict relayed", { skip: SKIP }, () => {
  const out = run("printf 'DECISION: ALLOW\nREASON: ok\n'");
  assert.match(out, /SOURCE: codex/);
  assert.match(out, /DECISION: ALLOW/);
});
test("codex exits non-zero -> fallback to do:change-skeptic", { skip: SKIP }, () => {
  const out = run("echo boom; exit 7");
  assert.match(out, /SOURCE: change-skeptic/);
  assert.match(out, /exited non-zero/);
});
test("codex returns no DECISION line -> fallback", { skip: SKIP }, () => {
  const out = run("echo just chatter");
  assert.match(out, /SOURCE: change-skeptic/);
  assert.match(out, /no DECISION/);
});
test("codex times out -> fallback", { skip: SKIP }, () => {
  const out = run("sleep 3", 1);
  assert.match(out, /SOURCE: change-skeptic/);
  assert.match(out, /timed out/);
});
test("codex absent -> fallback", { skip: SKIP }, () => {
  const out = run("definitely-no-such-codex-bin-xyz");
  assert.match(out, /SOURCE: change-skeptic/);
  assert.match(out, /not on PATH/);
});

// Regression: without GNU `timeout`, codex must STILL be bounded by the manual bg+poll+reap path
// (before the fix, a no-`timeout` host ran codex unbounded). INTEGRITY_FORCE_MANUAL_TIMEOUT drives
// that path deterministically without having to strip `timeout` from PATH.
test("forced manual timeout (no GNU `timeout`): codex still bounded -> fallback", { skip: SKIP }, () => {
  const out = run("sleep 3", 1, { INTEGRITY_FORCE_MANUAL_TIMEOUT: "1" });
  assert.match(out, /SOURCE: change-skeptic/);
  assert.match(out, /timed out/);
});
test("forced manual timeout: DECISION present is still relayed (SOURCE: codex)", { skip: SKIP }, () => {
  const out = run("printf 'DECISION: ALLOW\\nREASON: ok\\n'", 300, { INTEGRITY_FORCE_MANUAL_TIMEOUT: "1" });
  assert.match(out, /SOURCE: codex/);
  assert.match(out, /DECISION: ALLOW/);
});
