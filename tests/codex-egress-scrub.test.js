const { test } = require("node:test");
const assert = require("node:assert");
const { execFileSync } = require("node:child_process");
const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const { bashEnv, bashPath, repoRoot: ROOT } = require("./bash-paths");

// Coverage for the codex-integrity EGRESS hardening (the secret-scrub invariant) AND the turn-end
// review's empower contract (2026-06-30 owner directive: exercise codex at full capability):
//   (1) turn text is secret-scrubbed BEFORE it is piped to the external codex CLI,
//   (2) scrubbing is fail-closed -- a broken scrubber must NOT leak raw text,
//   (3) the default codex invocation empowers edits (workspace-write via the proven bypass flag)
//       with a read-only kill switch (ASK_CODEX_ALLOW_EDITS=0),
//   (4) module.json discloses the external-LLM egress + that codex edits by default (kill switch).
// (1)(2) are the egress invariant and FAIL against any script that pipes the raw packet to codex;
// empowering WRITE does not relax them. (3)(4) pin the empower contract.

const MODDIR = join(ROOT, "do", "modules", "codex-integrity");
const RUNNER = bashPath(join(MODDIR, "run-integrity.sh"));
const HOOK = bashPath(join(MODDIR, "hooks", "codex-stop.sh"));
const HOOK_SRC = join(MODDIR, "hooks", "codex-stop.sh");

function has(bin) { try { execFileSync("bash", ["-lc", "command -v " + bin], { stdio: "ignore" }); return true; } catch { return false; } }
const SKIP = !has("bash") ? "bash unavailable" : (!has("jq") ? "jq unavailable" : (!has("node") ? "node unavailable" : false));

const SECRET = "AKIAEXAMPLE0123ABCD9"; // matches the AWS-key scrubber rule (AKIA + 16 [0-9A-Z])
const REDACTED = "[REDACTED_AWS_KEY]";

// A codex stub that copies whatever it receives on stdin to CAP (so we can inspect the egress
// payload) and then emits a valid DECISION line so run-integrity.sh treats it as success.
function captureCodexCmd(capPath) {
  return `cat > '${capPath}'; printf 'DECISION: ALLOW\\n'`;
}

// ---- run-integrity.sh : the egress chokepoint -------------------------------------------------

test("run-integrity scrubs the packet before piping it to codex", { skip: SKIP }, () => {
  const dir = mkdtempSync(join(tmpdir(), "do-egress-"));
  const pkt = join(dir, "packet.txt");
  const cap = join(dir, "captured-stdin.txt");
  writeFileSync(pkt, `review this turn. leaked key: ${SECRET}\n`);
  const out = execFileSync("bash", [RUNNER, bashPath(pkt)], {
    env: bashEnv({ INTEGRITY_CODEX_CMD: captureCodexCmd(bashPath(cap)) }),
    encoding: "utf8",
  });
  assert.match(out, /SOURCE: codex/, "codex path taken");
  assert.ok(existsSync(cap), "codex received a payload");
  const sent = readFileSync(cap, "utf8");
  assert.ok(!sent.includes(SECRET), "raw secret must NOT reach codex");
  assert.ok(sent.includes(REDACTED), "secret is redacted in what codex receives");
});

test("run-integrity is fail-closed: a broken scrubber sends NOTHING to codex", { skip: SKIP }, () => {
  const dir = mkdtempSync(join(tmpdir(), "do-egress-"));
  const pkt = join(dir, "packet.txt");
  const cap = join(dir, "captured-stdin.txt");
  writeFileSync(pkt, `secret ${SECRET} in the packet\n`);
  const out = execFileSync("bash", [RUNNER, bashPath(pkt)], {
    env: bashEnv({ DO_SCRUB_CMD: "exit 1", INTEGRITY_CODEX_CMD: captureCodexCmd(bashPath(cap)) }),
    encoding: "utf8",
  });
  assert.match(out, /SOURCE: change-skeptic/, "routes to the in-session fallback");
  assert.match(out, /scrubber/i, "reason names the scrubber failure");
  assert.equal(existsSync(cap), false, "codex was never invoked -> no egress of raw text");
});

test("run-integrity is fail-closed: a no-op scrubber (empty output) does not egress", { skip: SKIP }, () => {
  const dir = mkdtempSync(join(tmpdir(), "do-egress-"));
  const pkt = join(dir, "packet.txt");
  const cap = join(dir, "captured-stdin.txt");
  writeFileSync(pkt, `secret ${SECRET} that must not leak\n`);
  // `true` exits 0 but prints nothing -> a non-empty packet scrubbing to empty == scrubber not wired.
  const out = execFileSync("bash", [RUNNER, bashPath(pkt)], {
    env: bashEnv({ DO_SCRUB_CMD: "true", INTEGRITY_CODEX_CMD: captureCodexCmd(bashPath(cap)) }),
    encoding: "utf8",
  });
  assert.match(out, /SOURCE: change-skeptic/, "no-output scrubber -> fallback");
  assert.equal(existsSync(cap), false, "codex was never invoked -> no egress");
});

test("run-integrity default scrubber resolves the real lib/do-mon-context.js --scrub", { skip: SKIP }, () => {
  // No DO_SCRUB_CMD override: exercise the shipped default path end to end.
  const dir = mkdtempSync(join(tmpdir(), "do-egress-"));
  const pkt = join(dir, "packet.txt");
  const cap = join(dir, "captured-stdin.txt");
  writeFileSync(pkt, `default-path secret ${SECRET}\n`);
  const out = execFileSync("bash", [RUNNER, bashPath(pkt)], {
    env: bashEnv({ INTEGRITY_CODEX_CMD: captureCodexCmd(bashPath(cap)) }),
    encoding: "utf8",
  });
  assert.match(out, /SOURCE: codex/);
  const sent = readFileSync(cap, "utf8");
  assert.ok(!sent.includes(SECRET) && sent.includes(REDACTED), "default scrubber redacted the secret");
});

test("run-integrity passes INTEGRITY_CODEX_ARGV as LITERAL argv (no shell injection)", { skip: SKIP }, () => {
  // Drop a fake `codex` that records its argv, then drive run-integrity through the default
  // (no INTEGRITY_CODEX_CMD) argv path with a metacharacter-laden arg. The arg must arrive verbatim
  // -- proving it is passed as a literal argument and never re-parsed by a shell. Fixture files and
  // the launcher script are written with node so test setup does not depend on nested shell quoting.
  const dir = mkdtempSync(join(tmpdir(), "do-argv-"));
  const bin = join(dir, "bin");
  mkdirSync(bin, { recursive: true });
  const argCap = bashPath(join(dir, "argv.txt"));
  const sentinelName = "pwned_no_eval";
  const sentinel = join(dir, sentinelName);
  // Fake codex: append each arg on its own line to ARGCAP, drain stdin, emit a valid DECISION.
  writeFileSync(join(bin, "codex"),
    '#!/bin/sh\nfor a in "$@"; do printf \'%s\\n\' "$a" >> "$ARGCAP"; done\ncat >/dev/null\nprintf \'DECISION: ALLOW\\n\'\n');
  const pkt = bashPath(join(dir, "packet.txt"));
  writeFileSync(join(dir, "packet.txt"), "review this\n");
  // A -C arg carrying a command substitution: if any shell ever re-parses it, the sentinel appears.
  const evil = `$(touch ${bashPath(sentinel)})`;
  const argv = ["exec", "--sandbox", "read-only", "-C", evil, "-"].join("\n");
  const launcher = join(dir, "run-argv.sh");
  writeFileSync(launcher, [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    `chmod +x '${bashPath(join(bin, "codex"))}'`,
    `export ARGCAP='${argCap}'`,
    'ND=$(dirname "$(command -v node)")',
    `export PATH='${bashPath(bin)}':"$ND:/usr/bin:/bin"`,
    "export INTEGRITY_CODEX_ARGV=$(cat <<'DO_ARGV'",
    argv,
    "DO_ARGV",
    ")",
    `exec bash '${RUNNER}' '${pkt}'`,
    "",
  ].join("\n"));
  const out = execFileSync("bash", [bashPath(launcher)], {
    env: bashEnv(),
    encoding: "utf8",
  });
  assert.match(out, /SOURCE: codex/, "default argv codex path taken");
  const args = readFileSync(join(dir, "argv.txt"), "utf8");
  assert.ok(args.includes(evil), "the metacharacter arg reached codex VERBATIM as one literal argument");
  assert.equal(existsSync(sentinel), false, "command substitution did NOT fire -> no shell re-evaluation");
  // Sanity: the read-only sandbox flags came through as discrete args too.
  assert.match(args, /--sandbox/);
  assert.match(args, /read-only/);
});

// ---- codex-stop.sh : Stop hook (defense in depth) --------------------------------

// Build a fresh config dir (no flag -> adversarial ON by default) + a project with the module
// recorded, plus a non-trivial transcript whose assistant text carries a secret.
function hookEnv(extra = {}) {
  const cfg = mkdtempSync(join(tmpdir(), "do-cfg-"));
  const proj = mkdtempSync(join(tmpdir(), "do-proj-"));
  mkdirSync(join(proj, ".claude"), { recursive: true });
  writeFileSync(join(proj, ".claude", "do.manifest.json"), JSON.stringify({ version: "0", modules: ["codex-integrity"] }));
  return bashEnv({ CLAUDE_CONFIG_DIR: bashPath(cfg), CLAUDE_PROJECT_DIR: bashPath(proj), ...extra });
}
function secretTranscript() {
  const dir = mkdtempSync(join(tmpdir(), "do-tx-"));
  // > 800 chars so the turn is non-trivial, with a secret embedded in the assistant text.
  const txt = `I changed things. leaked ${SECRET} here. ` + "detail ".repeat(160);
  const lines = [
    JSON.stringify({ type: "user", message: { content: "do the work" } }),
    JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: txt }] } }),
  ];
  const f = join(dir, "t.jsonl");
  writeFileSync(f, lines.join("\n") + "\n");
  return bashPath(f);
}

test("adversarial hook scrubs the turn text before it reaches codex", { skip: SKIP }, () => {
  const dir = mkdtempSync(join(tmpdir(), "do-egress-"));
  const cap = join(dir, "captured-stdin.txt");
  const env = hookEnv({ INTEGRITY_CODEX_CMD: captureCodexCmd(bashPath(cap)) });
  const input = JSON.stringify({ transcript_path: secretTranscript(), stop_hook_active: false });
  execFileSync("bash", [HOOK], { input, env, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
  assert.ok(existsSync(cap), "codex received a payload");
  const sent = readFileSync(cap, "utf8");
  assert.ok(!sent.includes(SECRET), "raw secret from the turn must NOT reach codex");
  assert.ok(sent.includes(REDACTED), "turn-text secret is redacted before egress");
});

test("adversarial hook is fail-closed: broken scrubber -> no codex egress", { skip: SKIP }, () => {
  const dir = mkdtempSync(join(tmpdir(), "do-egress-"));
  const cap = join(dir, "captured-stdin.txt");
  const env = hookEnv({ DO_SCRUB_CMD: "exit 1", INTEGRITY_CODEX_CMD: captureCodexCmd(bashPath(cap)) });
  const input = JSON.stringify({ transcript_path: secretTranscript(), stop_hook_active: false });
  const out = execFileSync("bash", [HOOK], { input, env, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
  assert.ok(!String(out).includes('"block"'), "fail-open on availability: never hard-blocks");
  assert.equal(existsSync(cap), false, "no raw turn text egressed when scrubbing fails");
});

// ---- static guards : sandbox flag + disclosure ------------------------------------------------

const RUNNER_SRC = join(MODDIR, "run-integrity.sh");

test("codex-stop.sh empowers the turn-end review to edit by default, with a read-only kill switch", () => {
  const src = readFileSync(HOOK_SRC, "utf8");
  const liveSrc = src.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");
  // DEFAULT: codex runs workspace-write (can apply fixes) via the proven bypass invocation -- genuine
  // sandboxing is broken on this Windows host, so this is the same flag skills/codex/codex.sh uses.
  assert.match(liveSrc, /workspace-write/, "default integrity invocation requests workspace-write so codex can apply fixes");
  assert.match(liveSrc, /dangerously-bypass-approvals-and-sandbox/, "uses the proven bypass invocation that actually runs on this host");
  // Max effort pinned explicitly (no silent drift to a weaker config default).
  assert.match(liveSrc, /model_reasoning_effort/, "pins reasoning effort on the review");
  assert.match(liveSrc, /xhigh/, "pins xhigh (max reasoning) on the review");
  // Kill switch: ASK_CODEX_ALLOW_EDITS=0 forces read-only / advise-only.
  assert.match(liveSrc, /ASK_CODEX_ALLOW_EDITS/, "honors the ASK_CODEX_ALLOW_EDITS kill switch");
  assert.match(liveSrc, /read-only/, "kill-switch path requests a read-only sandbox");
  // Injection-safe literal-argv mechanism preserved (project dir is one literal arg, never a shell string).
  assert.match(src, /INTEGRITY_CODEX_ARGV=/, "uses the injection-safe literal-argv mechanism");
});

test("codex-stop.sh does not interpolate the project dir into a bash -c shell string", () => {
  const src = readFileSync(HOOK_SRC, "utf8");
  // The pre-fix form baked $proj into an INTEGRITY_CODEX_CMD shell string later run via `bash -c`.
  // The hardened form passes args via INTEGRITY_CODEX_ARGV (literal argv elements), so $proj is
  // never embedded in a re-evaluated shell string.
  assert.ok(!/INTEGRITY_CODEX_CMD=.*\$proj/.test(src),
    "project dir is NOT interpolated into an INTEGRITY_CODEX_CMD shell string");
  assert.match(src, /INTEGRITY_CODEX_ARGV=/, "uses the injection-safe argv mechanism for the default invocation");
});

test("run-integrity.sh runs the default scrubber/codex as argv, not via bash -c on an interpolated string", () => {
  const src = readFileSync(RUNNER_SRC, "utf8");
  // The default scrubber must be a direct argv invocation of the node script -- repo_root must NOT
  // be interpolated into a shell string that is then `bash -c`'d.
  assert.match(src, /node "\$repo_root\/lib\/do-mon-context\.js" --scrub/,
    "default scrubber is a direct argv invocation");
  assert.ok(!/scrub_cmd="\$\{DO_SCRUB_CMD:-node/.test(src),
    "default scrubber is no longer assembled as a shell string with repo_root interpolated");
  // bash -c must only ever wrap an explicit env override variable, never an interpolated path.
  // Scan live (non-comment) lines only -- the header doc legitimately shows `bash -c "$str"`.
  const liveLines = src.split("\n").filter((l) => !l.trim().startsWith("#"));
  for (const line of liveLines) {
    for (const m of line.matchAll(/bash -c "(\$\{?\w+)/g)) {
      assert.match(m[1], /\$\{?(DO_SCRUB_CMD|INTEGRITY_CODEX_CMD)/,
        `bash -c only wraps an explicit override env var, found: ${m[1]}`);
    }
  }
});

test("module.json discloses external-LLM egress and that codex edits by default (with a read-only kill switch)", () => {
  const m = JSON.parse(readFileSync(join(MODDIR, "module.json"), "utf8"));
  assert.match(m.description, /external/i, "description discloses external LLM egress");
  assert.ok(m.disclosure, "structured disclosure block present");
  assert.equal(m.disclosure.sendsToExternalLLM, true, "discloses it sends data to an external LLM");
  assert.match(String(m.disclosure.dataSent), /scrub/i, "discloses turn text is scrubbed before egress");
  // The egress scrub is unchanged, but execution is now WRITE-by-default -- the disclosure must say so,
  // and must name the read-only kill switch, so the published contract is honest for every install.
  assert.match(String(m.disclosure.execution), /workspace-write|edit/i, "discloses codex edits the repo by default");
  assert.match(String(m.disclosure.execution), /ASK_CODEX_ALLOW_EDITS|read-only/i, "discloses the read-only kill switch");
});
