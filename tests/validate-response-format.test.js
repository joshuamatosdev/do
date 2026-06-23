const { test } = require("node:test");
const assert = require("node:assert");
const { execFileSync, spawnSync } = require("node:child_process");
const { mkdtempSync, mkdirSync, writeFileSync, copyFileSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");

// Stop hook validate-response-format.sh: classifies the turn (TRIVIAL/LITE/REPORT/FULL) and
// enforces the matching GATE-REQUIRED floor from .claude/RESPONSE-FORMAT.md. It prints a
// {decision:"block",reason} JSON object on stdout to block, or nothing to allow; it always
// exits 0. Invariants under test: (1) tier + floor are judged over the WHOLE turn's assistant
// text (every text block since the last human prompt), not just the closing message -- so a
// turn that delivered structure early and closed with a short summary passes; (2) the gate is
// evidence-gated -- it BLOCKS only a turn with proven on-transcript production substance, and
// only ADVISES (non-blocking, on stderr) a turn judged substantive by text length alone;
// (3) a subagent dispatch is not a substance signal -- it never floors the parent ack.
// Faithful test -- actually executes the bash hook; skipped where bash or jq is unavailable.
function has(bin) { try { execFileSync("bash", ["-c", `command -v ${bin}`], { stdio: "ignore" }); return true; } catch { return false; } }
const SKIP = !has("bash") ? "bash unavailable" : (!has("jq") ? "jq unavailable" : false);

const ROOT = join(__dirname, "..");
const fwd = (p) => p.replace(/\\/g, "/");
const HOOK = fwd(join(ROOT, "do", "spine", "hooks", "validate-response-format.sh"));
const SPEC = join(ROOT, "do", "spine", "RESPONSE-FORMAT.md");

function project() {
  const t = mkdtempSync(join(tmpdir(), "do-rf-"));
  mkdirSync(join(t, ".claude"), { recursive: true });
  copyFileSync(SPEC, join(t, ".claude", "RESPONSE-FORMAT.md"));
  return t;
}

// Build a transcript JSONL. entries: {role:"user"|"assistant", text?, tool?}
function transcript(dir, entries) {
  const lines = entries.map((e) => {
    if (e.role === "user") return JSON.stringify({ type: "user", message: { content: e.text } });
    const content = e.tool
      ? [{ type: "tool_use", name: e.tool, input: e.input || {} }]
      : [{ type: "text", text: e.text }];
    return JSON.stringify({ type: "assistant", message: { content } });
  });
  const f = join(dir, "t.jsonl");
  writeFileSync(f, lines.join("\n") + "\n");
  return fwd(f);
}

// Run the hook; capture stdout (block JSON) and stderr (advisory note). The hook always exits 0.
function run(dir, tf, stopActive = false) {
  const input = JSON.stringify({ transcript_path: tf, stop_hook_active: stopActive });
  const r = spawnSync("bash", [HOOK], { input, env: { ...process.env, CLAUDE_PROJECT_DIR: fwd(dir) }, encoding: "utf8" });
  return { stdout: r.stdout || "", stderr: r.stderr || "" };
}
// BLOCKED = a decision:block JSON on stdout (re-prompts). ADVISED = a non-blocking advisory on
// stderr. Mutually exclusive by construction: a turn is one, the other, or neither (exempt/conforming).
function blocked(dir, tf, stopActive = false) { return run(dir, tf, stopActive).stdout.includes('"block"'); }
function advised(dir, tf, stopActive = false) { return run(dir, tf, stopActive).stderr.includes("ADVISORY"); }

const LITE_FLOOR =
  "## Goal\nx\n## Immediate Actions\n1. y\n## Remaining Steps\n- [x] none ";
const PAD = "lorem ipsum dolor sit amet ".repeat(40); // ~1080 chars -> lands in the LITE band

test("the fix: structure delivered EARLY + a short closer is ALLOWED", { skip: SKIP }, () => {
  const d = project();
  const tf = transcript(d, [
    { role: "user", text: "do the thing" },
    { role: "assistant", text: LITE_FLOOR + PAD }, // full LITE structure, mid-length
    { role: "assistant", text: "Done. shipped." }, // short header-less closer
  ]);
  assert.equal(blocked(d, tf), false, "turn-wide text contains the floor; must allow");
});

test("no structure, mid-length, NO production edit -> ADVISE not block", { skip: SKIP }, () => {
  const d = project();
  const tf = transcript(d, [
    { role: "user", text: "do the thing" },
    { role: "assistant", text: "just prose, no headers at all. " + PAD },
  ]);
  assert.equal(blocked(d, tf), false, "text-only: substantive by inference only -> must not block");
  assert.equal(advised(d, tf), true, "text-only miss -> non-blocking advisory");
});

test("production edit + mid-length missing structure -> BLOCK (proven substance)", { skip: SKIP }, () => {
  const d = project();
  const tf = transcript(d, [
    { role: "user", text: "change the parser" },
    { role: "assistant", tool: "Edit", input: { file_path: "src/parser.ts" } },
    { role: "assistant", text: "changed it. " + PAD }, // LITE band, no headers, but a real .ts edit
  ]);
  assert.equal(blocked(d, tf), true, "on-transcript production edit owes a structured account");
});

test("subagent dispatch + short text -> ALLOW (dispatch is not a substance signal)", { skip: SKIP }, () => {
  const d = project();
  const tf = transcript(d, [
    { role: "user", text: "ship it via an agent" },
    { role: "assistant", tool: "Agent", input: { description: "ship" } },
    { role: "assistant", text: "Done, the agent shipped it." }, // 27 chars, no on-transcript edit -> TRIVIAL/exempt
  ]);
  assert.equal(blocked(d, tf), false, "dispatch no longer floors the parent ack");
  assert.equal(advised(d, tf), false, "short exempt turn -> not even advised");
});

test("genuinely trivial short turn, no dispatch -> ALLOW (exempt)", { skip: SKIP }, () => {
  const d = project();
  const tf = transcript(d, [
    { role: "user", text: "hi" },
    { role: "assistant", text: "Hello, yes." },
  ]);
  assert.equal(blocked(d, tf), false);
});

test("recursion guard: stop_hook_active=true always allows", { skip: SKIP }, () => {
  const d = project();
  const tf = transcript(d, [
    { role: "user", text: "do the thing" },
    { role: "assistant", text: "no structure " + PAD }, // would block at false
  ]);
  assert.equal(blocked(d, tf, true), false);
});
