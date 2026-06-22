const { test } = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const { scrub } = require("../lib/do-mon-context");

const LIB = join(__dirname, "..", "lib", "do-mon-context.js");

// --- (A) broadened generic-key secret scrubber -------------------------------
// Each of these LEAKED under the old regex, which required a leading double-quote
// on the value (only JSON "key":"value" was redacted). They must all redact now.

test("scrub redacts .env-style KEY=value (bare, unquoted)", () => {
  assert.match(scrub("PASSWORD=MyS3cr3t"), /PASSWORD=\[REDACTED\]/);
  assert.ok(!scrub("PASSWORD=MyS3cr3t").includes("MyS3cr3t"), "secret value must not survive");
});

test("scrub redacts API_KEY=value (bare, alphanumeric)", () => {
  assert.match(scrub("API_KEY=ABCDEF1234567890"), /API_KEY=\[REDACTED\]/);
  assert.ok(!scrub("API_KEY=ABCDEF1234567890").includes("ABCDEF1234567890"));
});

test("scrub redacts single-quoted key='value'", () => {
  assert.match(scrub("client_secret='abc'"), /client_secret=\[REDACTED\]/);
  assert.ok(!scrub("client_secret='abc'").includes("abc"));
});

test("scrub redacts an exported env var: export TOKEN=value", () => {
  const out = scrub("export TOKEN=xyz");
  assert.match(out, /TOKEN=\[REDACTED\]/);
  assert.ok(out.startsWith("export "), "the 'export ' keyword is preserved");
  assert.ok(!out.includes("xyz"), "secret value must not survive");
});

test("scrub still redacts the JSON \"key\":\"value\" shape", () => {
  assert.match(scrub('"secret":"v"'), /"secret":\[REDACTED\]/);
  assert.ok(!scrub('"secret":"v"').includes('"v"'));
  // spaced JSON form too
  assert.match(scrub('"password": "hunter2"'), /\[REDACTED\]/);
  assert.ok(!scrub('"password": "hunter2"').includes("hunter2"));
});

test("scrub passes a normal sentence through unchanged", () => {
  const sentence = "The quick brown fox jumps over the lazy dog.";
  assert.equal(scrub(sentence), sentence);
});

test("scrub does not redact prose that merely mentions a key word with no separator", () => {
  // 'password' with no ':' or '=' must not trigger redaction
  const prose = "Please reset your password soon.";
  assert.equal(scrub(prose), prose);
});

test("scrub keeps the specific value-shape branches intact", () => {
  // These prove the broadened key-branch did not displace the AWS/GitHub/Google/
  // JWT/Bearer/sk- value-shape redactions.
  assert.match(scrub("key=AKIAIOSFODNN7EXAMPLE"), /\[REDACTED_AWS_KEY\]/);
  assert.match(scrub("Authorization: Bearer abc.def-123"), /Bearer \[REDACTED\]/);
  assert.match(
    scrub("tok eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"),
    /\[REDACTED_JWT\]/,
  );
  assert.match(scrub("OPENAI=sk-abcdef012345678901234"), /\[REDACTED_OPENAI_KEY\]/);
  assert.match(scrub("ghp_0123456789abcdef0123456789abcdef0123"), /\[REDACTED_GITHUB_TOKEN\]/);
  assert.match(scrub("g=AIzaSyA1234567890abcdefghijklmnopqrst"), /\[REDACTED_GOOGLE_KEY\]/);
});

// --- (B) scrub() exposed as a --scrub CLI ------------------------------------

function runScrubCli(input) {
  return spawnSync(process.execPath, [LIB, "--scrub"], { input, encoding: "utf8" });
}

test("CLI --scrub reads stdin, redacts, writes to stdout, exits 0", () => {
  const r = runScrubCli("PASSWORD=MyS3cr3t");
  assert.equal(r.status, 0, "exit code must be 0");
  assert.match(r.stdout, /PASSWORD=\[REDACTED\]/);
  assert.ok(!r.stdout.includes("MyS3cr3t"), "secret must not reach stdout");
});

test("CLI --scrub passes a clean sentence through unchanged", () => {
  const sentence = "The quick brown fox jumps over the lazy dog.";
  const r = runScrubCli(sentence);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, sentence);
});

test("CLI --scrub handles empty stdin without error", () => {
  const r = runScrubCli("");
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "");
});
