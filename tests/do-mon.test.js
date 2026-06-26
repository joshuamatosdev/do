const { test } = require("node:test");
const assert = require("node:assert");
const { mkdtempSync, mkdtempSync: mkd, writeFileSync, existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const { spawnSync } = require("node:child_process");
const {
  decideMode, safeWriteFlag, clearFlag, readFlag,
  readConfig, writeConfig, DEFAULT_CONFIG, FLAG_VALUE,
} = require("../hooks/do-mon-config");
const { scrub, extractTranscript } = require("../lib/do-mon-context");
const SKILL = join(__dirname, "..", "skills", "mon", "SKILL.md");
const ADAPTER = join(__dirname, "..", "skills", "mon", "references", "chatgpt-adapter.md");

const tmpFlag = () => join(mkdtempSync(join(tmpdir(), "do-mon-")), ".do-mon-active");
const tmpCfg = () => join(mkdtempSync(join(tmpdir(), "do-mon-")), "config.json");

test("decideMode: set on /do mon on and /do:mon on and NL enable", () => {
  assert.equal(decideMode("/do mon on").action, "set");
  assert.equal(decideMode("/do:mon on").action, "set");
  assert.equal(decideMode("turn on do:mon").action, "set");
});

test("decideMode: handles the renamed /do:run mon command form", () => {
  assert.equal(decideMode("/do:run mon on").action, "set");
  assert.equal(decideMode("/do:run mon off").action, "clear");
  assert.equal(decideMode("/do:run mon status").action, "status");
  assert.equal(decideMode("/do:run mon why does this hang?").action, "none");
});

test("decideMode: clear on off / disable / NL", () => {
  assert.equal(decideMode("/do mon off").action, "clear");
  assert.equal(decideMode("/do:mon off").action, "clear");
  assert.equal(decideMode("turn off do:mon").action, "clear");
  assert.equal(decideMode("disable do:mon").action, "clear");
});

test("decideMode: status, and a question is NOT a toggle", () => {
  assert.equal(decideMode("/do mon status").action, "status");
  assert.equal(decideMode("/do:mon why does this deadlock?").action, "none");
  assert.equal(decideMode("/do:mon").action, "none");
  assert.equal(decideMode("add a button").action, "none");
});

test("decideMode: a slash consult whose QUESTION mentions toggle words is NOT a toggle", () => {
  // explicit "/do[:run] mon <question>" is a command — the NL heuristics must never reinterpret it
  assert.equal(decideMode("/do:mon should we disable the retry?").action, "none");
  assert.equal(decideMode("/do mon why is the feature off?").action, "none");
  assert.equal(decideMode("/do:run mon is it safe to turn off WAL?").action, "none");
});

test("flag roundtrip: write -> read 'on' -> clear -> null", () => {
  const fp = tmpFlag();
  assert.equal(safeWriteFlag(fp), true);
  assert.equal(readFlag(fp), "on");
  clearFlag(fp);
  assert.equal(readFlag(fp), null);
});

test("readFlag rejects oversized / wrong content", () => {
  const fp = tmpFlag();
  writeFileSync(fp, "x".repeat(100));
  assert.equal(readFlag(fp), null);
  writeFileSync(fp, "off");
  assert.equal(readFlag(fp), null);
});

test("config roundtrip + default on miss + garbage -> default", () => {
  const fp = tmpCfg();
  assert.deepEqual(readConfig(fp), DEFAULT_CONFIG); // missing file -> default
  const cfg = readConfig(fp);
  cfg.browser = "claude-in-chrome";
  assert.equal(writeConfig(cfg, fp), true);
  assert.equal(readConfig(fp).browser, "claude-in-chrome");
  writeFileSync(fp, "{not json");
  assert.deepEqual(readConfig(fp), DEFAULT_CONFIG); // garbage -> default
});

test("DEFAULT_CONFIG ships exactly the chatgpt reasoner with minutes timeout", () => {
  assert.equal(DEFAULT_CONFIG.defaultReasoner, "chatgpt");
  assert.equal(DEFAULT_CONFIG.reasoners.length, 1);
  const c = DEFAULT_CONFIG.reasoners[0];
  assert.equal(c.id, "chatgpt");
  assert.equal(c.url, "https://chatgpt.com/");
  assert.equal(c.promptShape, "single-block-no-newlines");
  assert.ok(c.timeoutSec >= 600, "Pro reasoning is minutes; timeout must be generous");
});

test("scrub redacts the common secret shapes", () => {
  assert.match(scrub("key=AKIAIOSFODNN7EXAMPLE"), /\[REDACTED_AWS_KEY\]/);
  assert.match(scrub("Authorization: Bearer abc.def-123"), /Bearer \[REDACTED\]/);
  assert.match(scrub("tok eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"), /\[REDACTED_JWT\]/);
  assert.match(scrub("OPENAI=sk-abcdef012345678901234"), /\[REDACTED_OPENAI_KEY\]/);
  assert.match(scrub("ghp_0123456789abcdef0123456789abcdef0123"), /\[REDACTED_GITHUB_TOKEN\]/);
  assert.match(scrub("g=AIzaSyA1234567890abcdefghijklmnopqrst"), /\[REDACTED_GOOGLE_KEY\]/);
  assert.match(scrub('"password": "hunter2"'), /\[REDACTED\]/);
  const pem = "-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----";
  assert.match(scrub(pem), /\[REDACTED_PRIVATE_KEY_BLOCK\]/);
});

test("extractTranscript keeps text, elides tool-result bodies, keeps last user msg", () => {
  const fp = join(mkdtempSync(join(tmpdir(), "do-mon-tx-")), "s.jsonl");
  const rows = [
    { type: "user", message: { content: [{ type: "text", text: "first question" }] } },
    { type: "assistant", message: { content: [
      { type: "text", text: "thinking" },
      { type: "tool_use", name: "Read", input: { file_path: "x" } },
    ] } },
    { type: "user", message: { content: [{ type: "tool_result", content: "HUGE BODY".repeat(50) }] } },
    { type: "user", message: { content: [{ type: "text", text: "the real latest question" }] } },
  ];
  writeFileSync(fp, rows.map((r) => JSON.stringify(r)).join("\n"));
  const { conv, lastUser } = extractTranscript(fp);
  assert.match(conv, /\[USER\] first question/);
  assert.match(conv, /<tool_use:Read>/);
  assert.match(conv, /<tool_result>/);
  assert.ok(!conv.includes("HUGE BODYHUGE BODY"), "tool_result body must be elided");
  assert.equal(lastUser, "the real latest question");
});

test("extractTranscript tail-truncates and notes it", () => {
  const fp = join(mkdtempSync(join(tmpdir(), "do-mon-tx-")), "big.jsonl");
  const rows = [];
  for (let i = 0; i < 200; i++) rows.push({ type: "assistant", message: { content: [{ type: "text", text: "padding line " + i + " ".repeat(20) }] } });
  rows.push({ type: "user", message: { content: [{ type: "text", text: "latest" }] } });
  writeFileSync(fp, rows.map((r) => JSON.stringify(r)).join("\n"));
  const { conv, lastUser, truncNote } = extractTranscript(fp, { tailBytes: 500 });
  assert.ok(Buffer.byteLength(conv, "utf8") <= 500);
  assert.match(truncNote, /truncated/);
  assert.equal(lastUser, "latest");
});

test("mon SKILL.md exists with valid strict frontmatter", () => {
  const { validateFrontmatter } = require("../tools/frontmatter-schema");
  const text = readFileSync(SKILL, "utf8");
  assert.deepEqual(validateFrontmatter("skill", text, "mon"), []);
});

test("mon SKILL.md states the load-bearing invariants", () => {
  const t = readFileSync(SKILL, "utf8").toLowerCase();
  assert.ok(t.includes("prompt-only"), "egress floor stated");
  assert.ok(t.includes("scrub"), "scrub mandated");
  assert.ok(t.includes("advisory"), "answer is advisory");
  assert.ok(t.includes("no newlines") || t.includes("single block"), "no-newline prompt rule");
  assert.ok(t.includes("chatgpt-adapter"), "points at the adapter reference");
  assert.ok(t.includes("agent-team"), "documents the agent-team escalation seam");
  assert.ok(t.includes("built-in claude browser"), "prefers the built-in Claude browser first");
  assert.ok(t.includes("browser mcp"), "falls back to browser MCP tools");
  assert.ok(t.includes("switching browser driver"), "requires an explicit switch notice");
  assert.ok(t.includes("cause"), "requires the switch cause to be named");
  assert.ok(!t.includes("do:codex"), "must not dangle a do:codex reference");
  assert.ok(!t.includes("do:do-team") && !t.includes("do:team"), "must not dangle a do: team ref");
});

test("chatgpt-adapter.md carries the grounded drive heuristics", () => {
  const t = readFileSync(ADAPTER, "utf8");
  assert.match(t, /get_page_text/);
  assert.match(t, /screenshot/);
  assert.match(t, /Return/);
  assert.match(t, /chatgpt\.com/);
  assert.match(t, /b6b946f2/, "cites the source session");
  assert.ok(/minute/i.test(t), "states the multi-minute latency reality");
  assert.match(t, /built-in Claude browser/, "tries Claude's built-in browser first");
  assert.match(t, /browser MCP/i, "falls back to browser MCP tools");
  assert.match(t, /switching browser driver/i, "requires an explicit switch notice");
});

function runHook(file, { prompt, configDir }) {
  return spawnSync(process.execPath, [join(__dirname, "..", "hooks", file)], {
    input: prompt === undefined ? "" : JSON.stringify({ prompt }),
    env: { ...process.env, CLAUDE_CONFIG_DIR: configDir },
    encoding: "utf8",
  });
}

test("tracker: /do mon on writes the flag and emits the reminder", () => {
  const dir = mkd(join(tmpdir(), "do-mon-hook-"));
  const r = runHook("do-mon-tracker.js", { prompt: "/do mon on", configDir: dir });
  assert.ok(existsSync(join(dir, ".do-mon-active")), "flag file created");
  assert.match(r.stdout, /DO:MON mode ACTIVE/);
  assert.match(r.stdout, /PROMPT-ONLY/i);
});

test("tracker: /do mon off clears the flag and stays silent", () => {
  const dir = mkd(join(tmpdir(), "do-mon-hook-"));
  runHook("do-mon-tracker.js", { prompt: "/do mon on", configDir: dir });
  const r = runHook("do-mon-tracker.js", { prompt: "/do mon off", configDir: dir });
  assert.ok(!existsSync(join(dir, ".do-mon-active")), "flag cleared");
  assert.equal(r.stdout.trim(), "");
});

test("activate: emits the banner only when the flag is on", () => {
  const dir = mkd(join(tmpdir(), "do-mon-hook-"));
  let r = runHook("do-mon-activate.js", { configDir: dir });
  assert.equal(r.stdout.trim(), "", "silent when inactive");
  runHook("do-mon-tracker.js", { prompt: "/do mon on", configDir: dir });
  r = runHook("do-mon-activate.js", { configDir: dir });
  assert.match(r.stdout, /DO:MON mode ACTIVE/);
});
