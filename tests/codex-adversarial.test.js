const { test } = require("node:test");
const assert = require("node:assert");
const { execFileSync, spawnSync } = require("node:child_process");
const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const { bashEnv, bashPath, repoRoot: ROOT } = require("./bash-paths");

// Both the adversarial executor and the advisory reminder are now branches of the unified codex-stop.sh.
const HOOK = bashPath(join(ROOT, "do", "modules", "codex-integrity", "hooks", "codex-stop.sh"));
const REMINDER = HOOK;
const MODE = join(ROOT, "do", "modules", "codex-integrity", "lib", "adversarial-mode.js");
const FLAG = ".do-codex-adversarial-active";

function has(bin) { try { execFileSync("bash", ["-c", `command -v ${bin}`], { stdio: "ignore" }); return true; } catch { return false; } }
const SKIP = !has("bash") ? "bash unavailable" : (!has("jq") ? "jq unavailable" : false);

// A fresh global config dir (holds the flag) + a project (holds the manifest).
// mode: "default" (no flag -> ON by default) | "on" (flag "on") | "off" (flag "off" -> disabled).
function env(mode, modules = ["codex-integrity"], extra = {}) {
  const cfg = mkdtempSync(join(tmpdir(), "do-cfg-"));
  if (mode === "on") writeFileSync(join(cfg, FLAG), "on");
  else if (mode === "off") writeFileSync(join(cfg, FLAG), "off");
  // "default" -> write nothing; an absent flag means adversarial mode is ON.
  const proj = mkdtempSync(join(tmpdir(), "do-proj-"));
  mkdirSync(join(proj, ".claude"), { recursive: true });
  writeFileSync(join(proj, ".claude", "do.manifest.json"), JSON.stringify({ version: "0", modules }));
  return bashEnv({ CLAUDE_CONFIG_DIR: bashPath(cfg), CLAUDE_PROJECT_DIR: bashPath(proj), ...extra });
}

// Transcript: a non-trivial turn (assistant text >= 800 chars) unless `trivial`.
function transcript(trivial) {
  const dir = mkdtempSync(join(tmpdir(), "do-tx-"));
  const txt = trivial ? "ok done" : "I made substantive changes. " + "detail ".repeat(160);
  const lines = [
    JSON.stringify({ type: "user", message: { content: "do the work" } }),
    JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: txt }] } }),
  ];
  const f = join(dir, "t.jsonl");
  writeFileSync(f, lines.join("\n") + "\n");
  return bashPath(f);
}

function frontierTranscript() {
  const dir = mkdtempSync(join(tmpdir(), "do-frontier-tx-"));
  const lines = [
    JSON.stringify({ type: "user", message: { content: "optimize the workflow" } }),
    JSON.stringify({
      type: "assistant",
      message: {
        content: [{
          type: "text",
          text: "## Remaining Steps\n- [ ] [DO:MON] decide the stop-hook design tradeoffs",
        }],
      },
    }),
  ];
  const f = join(dir, "t.jsonl");
  writeFileSync(f, lines.join("\n") + "\n");
  return bashPath(f);
}

// Run the hook; return { blocked, stdout }.
function runHook(e, tf, { stopActive = false } = {}) {
  const input = JSON.stringify({ transcript_path: tf, stop_hook_active: stopActive });
  try {
    const out = execFileSync("bash", [HOOK], { input, env: e, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
    return { blocked: out.includes('"block"'), stdout: out };
  } catch (err) {
    return { blocked: String(err.stdout || "").includes('"block"'), stdout: String(err.stdout || "") };
  }
}

test("adversarial prompt checks bugs, discovered frontier risk, and tech debt", { skip: SKIP }, () => {
  const cap = join(mkdtempSync(join(tmpdir(), "do-codex-prompt-")), "prompt.txt");
  const e = env("default", ["codex-integrity"], {
    INTEGRITY_CODEX_CMD: `cat > '${bashPath(cap)}'; printf 'DECISION: ALLOW\\n'`,
  });
  const r = runHook(e, transcript(false));
  assert.equal(r.blocked, false);
  const prompt = readFileSync(cap, "utf8");
  assert.match(prompt, /bugs introduced or left unfixed/);
  assert.match(prompt, /discovered frontier work left undone/);
  assert.match(prompt, /tech debt created or preserved/);
  // Empower contract (2026-06-30): the review must GROUND in the real files (not the pasted text)
  // and APPLY the fix when one is better -- not a shallow, advise-only pass.
  assert.match(prompt, /GROUND the review in the actual repo/);
  assert.match(prompt, /APPLY it directly/);
});

test("adversarial-mode CLI: ON by default, off persists a marker, toggle flips", { skip: SKIP }, () => {
  const cfg = mkdtempSync(join(tmpdir(), "do-cfg-"));
  const e = { ...process.env, CLAUDE_CONFIG_DIR: cfg };
  // default (no flag) -> ON
  assert.match(execFileSync("node", [MODE, "status"], { env: e, encoding: "utf8" }), /ON/);
  assert.equal(existsSync(join(cfg, FLAG)), false, "no flag file in the default (ON) state");
  // off -> writes an "off" marker (absent now means ON, so OFF must persist), status OFF
  execFileSync("node", [MODE, "off"], { env: e });
  assert.equal(readFileSync(join(cfg, FLAG), "utf8").trim(), "off", "off marker written");
  assert.match(execFileSync("node", [MODE, "status"], { env: e, encoding: "utf8" }), /OFF/);
  // toggle -> back ON
  assert.match(execFileSync("node", [MODE, "toggle"], { env: e, encoding: "utf8" }), /ON/);
  assert.notEqual(readFileSync(join(cfg, FLAG), "utf8").trim(), "off");
  // toggle -> OFF again
  assert.match(execFileSync("node", [MODE, "toggle"], { env: e, encoding: "utf8" }), /OFF/);
  assert.equal(readFileSync(join(cfg, FLAG), "utf8").trim(), "off");
});

test("ON by default: no flag + non-trivial + codex BLOCK -> blocks the turn", { skip: SKIP }, () => {
  const e = env("default", ["codex-integrity"], { INTEGRITY_CODEX_CMD: "printf 'DECISION: BLOCK\\n1. false claim\\n'" });
  const r = runHook(e, transcript(false));
  assert.equal(r.blocked, true);
});

test("explicit OFF: flag 'off' -> never blocks, even non-trivial + codex BLOCK stub", { skip: SKIP }, () => {
  const e = env("off", ["codex-integrity"], { INTEGRITY_CODEX_CMD: "printf 'DECISION: BLOCK\\n1. x\\n'" });
  const r = runHook(e, transcript(false));
  assert.equal(r.blocked, false);
});

test("recursion guard: stop_hook_active=true -> allow", { skip: SKIP }, () => {
  const r = runHook(env("default"), transcript(false), { stopActive: true });
  assert.equal(r.blocked, false);
});

test("self-gate: module absent -> allow even when ON", { skip: SKIP }, () => {
  const r = runHook(env("default", ["agent-team"]), transcript(false));
  assert.equal(r.blocked, false);
});

test("trivial turn -> skipped (no codex, no block) even when ON", { skip: SKIP }, () => {
  // Point codex at a BLOCK stub; the trivial gate must short-circuit BEFORE running it.
  const e = env("default", ["codex-integrity"], { INTEGRITY_CODEX_CMD: "printf 'DECISION: BLOCK\\n1. x\\n'" });
  const r = runHook(e, transcript(true));
  assert.equal(r.blocked, false);
});

test("ON + non-trivial + codex says ALLOW -> does not block", { skip: SKIP }, () => {
  const e = env("default", ["codex-integrity"], { INTEGRITY_CODEX_CMD: "printf 'DECISION: ALLOW\\n'" });
  const r = runHook(e, transcript(false));
  assert.equal(r.blocked, false);
});

test("ON + non-trivial + codex unavailable -> fail-open, no block", { skip: SKIP }, () => {
  const e = env("default", ["codex-integrity"], { INTEGRITY_CODEX_CMD: "definitely-not-a-real-cmd-xyz" });
  const r = runHook(e, transcript(false));
  assert.equal(r.blocked, false);
});

test("advisory reminder: silent when adversarial ON (default), emits when OFF (stderr)", { skip: SKIP }, () => {
  // The reminder writes to stderr. ON (default) -> suppressed; explicit OFF -> emits.
  const on = spawnSync("bash", [REMINDER], { input: "{}", env: env("default"), encoding: "utf8" });
  assert.equal((on.stderr || "").trim(), "", "no reminder when adversarial mode is ON (default)");
  const off = spawnSync("bash", [REMINDER], { input: "{}", env: env("off"), encoding: "utf8" });
  assert.match(off.stderr || "", /codex-integrity/, "reminder still emits when mode is OFF");
});

test("codex-frontier routes open decisions to DO:MON with a senior tech-lead brief", { skip: SKIP }, () => {
  const r = runHook(env("default", ["codex-frontier"]), frontierTranscript());
  assert.equal(r.blocked, true);
  assert.match(r.stdout, /DO:MON/);
  assert.match(r.stdout, /do:mon/);
  assert.match(r.stdout, /senior tech-lead/i);
  assert.match(r.stdout, /provide code/i);
  assert.match(r.stdout, /definition of done/i);
  assert.match(r.stdout, /acceptance criteria/i);
  assert.match(r.stdout, /trade-?offs/i);
  assert.match(r.stdout, /long-term scalable/i);
  assert.match(r.stdout, /Clean up agent-owned processes before stopping/);
});
