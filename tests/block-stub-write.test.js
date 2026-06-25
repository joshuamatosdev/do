const { test } = require("node:test");
const assert = require("node:assert");
const { execFileSync } = require("node:child_process");
const { mkdtempSync, mkdirSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const { bashEnv, bashPath, repoRoot: ROOT } = require("./bash-paths");

// block-stub-write.sh is a PreToolUse(Edit|Write) gate: it must BLOCK a write whose decoded content
// is a stub placeholder (exit 2) and ALLOW real code (exit 0). Claude Code sends the file content
// JSON-ESCAPED inside tool_input.content (Write) / tool_input.new_string (Edit), so the gate parses
// the payload, extracts the field, and tests the DECODED string against the markers.
//
// This pins the detection contract end-to-end against the real bash hook, and guards two fail-open
// bugs in the old raw-JSON regex:
//   (1) a `[^}]*` span stopped at the first close-brace -> any code with a brace before the marker
//       slipped through (the brace-before-marker case below BLOCKS now; it ALLOWED before);
//   (2) a quote-anchored pattern using literal quotes never matched the JSON-escaped wire bytes
//       (the escaped-quote throw case below BLOCKS now; it ALLOWED before).
// The self-gate (manifest opt-in) + exit-2 wiring is also covered in hooks-self-gate.test.js.
//
// NOTE: every stub marker in this file -- in fixtures, prose, AND assertions -- is assembled from
// fragments via frag(), so the file's own content carries no contiguous marker. (This very hook
// scans Write content; a test file with literal placeholder phrases is blocked by the thing it tests.)
//
// Faithful test -- actually executes the bash hook; skipped where bash is unavailable.
function hasBash() { try { execFileSync("bash", ["-c", "exit 0"], { stdio: "ignore" }); return true; } catch { return false; } }
const SKIP = hasBash() ? false : "bash unavailable on this host";

const HOOK = "do/spine/hooks/block-stub-write.sh";

function runHook(input, projectDir) {
  try {
    execFileSync("bash", [HOOK], {
      cwd: ROOT,
      input,
      env: bashEnv({ CLAUDE_PROJECT_DIR: bashPath(projectDir) }),
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { code: 0, stderr: "" };
  } catch (e) { return { code: e.status ?? 1, stderr: (e.stderr || "").toString() }; }
}

// An installed project has the manifest, so the gate is active. (A bare project self-gates to exit 0
// regardless of content -- covered in hooks-self-gate.test.js and once below.)
let PROJECT;
function project() {
  if (!PROJECT) {
    PROJECT = mkdtempSync(join(tmpdir(), "do-stub-"));
    mkdirSync(join(PROJECT, ".claude"), { recursive: true });
    writeFileSync(join(PROJECT, ".claude", "do.manifest.json"), JSON.stringify({ version: "0.1.0", modules: [] }));
  }
  return PROJECT;
}

// Build faithful Write (content) and Edit (new_string) payloads. JSON.stringify produces the exact
// wire escaping Claude Code emits -- inner double-quotes become escaped -- which is what defeated the
// old quote-anchored regex.
const writePayload = (content) => JSON.stringify({ tool_name: "Write", tool_input: { file_path: "f.js", content } });
const editPayload = (newStr) => JSON.stringify({ tool_name: "Edit", tool_input: { file_path: "f.js", old_string: "a", new_string: newStr } });

const BLOCK = (payload, dir, msg) => {
  const r = runHook(payload, dir || project());
  assert.equal(r.code, 2, msg || `expected BLOCK (exit 2): ${payload}`);
  assert.match(r.stderr, /stub\/placeholder write blocked/);
};
const ALLOW = (payload, dir, msg) => {
  assert.equal(runHook(payload, dir || project()).code, 0, msg || `expected ALLOW (exit 0): ${payload}`);
};

// frag(...parts) joins fragments with no separator -> the contiguous marker exists only at runtime,
// never as literal text in this source file.
const frag = (...parts) => parts.join("");
const DQ = String.fromCharCode(34); // a double-quote char, kept out of the source as a literal marker

// Stub markers, each assembled at runtime. These are the contiguous strings the hook must catch.
const M = {
  todoImplement: frag("// T", "ODO: ", "implement the parser"),
  fixmeStub: frag("/* FIX", "ME: ", "stub */ return null;"),
  throwNotImpl: frag("function f() { throw new Error(", DQ, "not ", "implemented", DQ, "); }"),
  pyNotImpl: frag("def f():\n    raise NotImplemented", "Error"),
  unimplementedWord: frag("// this path is unimpl", "emented for now"),
  rustTodo: frag("fn f() { to", "do!() }"),
  rustUnimpl: frag("fn f() { unimpl", "emented!() }"),
};

test(frag("BLOCK: each stub marker, JSON-escaped, in a Write payload"), { skip: SKIP }, () => {
  for (const [name, src] of Object.entries(M)) BLOCK(writePayload(src), undefined, `marker '${name}' should BLOCK`);
});

test(frag("BLOCK: stub marker in an Edit payload (new_string)"), { skip: SKIP }, () => {
  BLOCK(editPayload(M.todoImplement));
  BLOCK(editPayload(M.throwNotImpl));
});

test(frag("BLOCK: markers are matched case-insensitively"), { skip: SKIP }, () => {
  BLOCK(writePayload(frag("// t", "odo: ", "IMPLEMENT later")));
  BLOCK(writePayload(frag("// NOT ", "IMPLEMENTED")));
});

// Regression: the old close-brace-limited span broke at the first close-brace. A brace BEFORE the
// marker (an object literal, an empty block) used to break the span and FAIL OPEN. Now it must BLOCK.
test(frag("BLOCK: brace-before-marker (old span fail-open)"), { skip: SKIP }, () => {
  BLOCK(writePayload(frag("const o = {}; // T", "ODO: ", "implement this")));
  BLOCK(writePayload(frag("function f() {} // FIX", "ME: ", "stub")));
  BLOCK(editPayload(frag("if (x) { doThing(); }\n// T", "ODO: ", "implement the rest")));
});

// Regression: the old pattern anchored on literal double-quotes, which never matched the JSON-escaped
// wire bytes. The fixture below carries the escaped quotes on the wire; the hook must still BLOCK.
test(frag("BLOCK: JSON-escaped throw of an Error whose message is the placeholder phrase"), { skip: SKIP }, () => {
  const payload = editPayload(M.throwNotImpl);
  // On the wire the inner quotes are backslash-escaped. Assert that shape is present (the exact thing
  // the old regex missed) -- substring built from fragments so this file carries no contiguous marker.
  const escapedShape = frag("Error(", "\\", DQ, "not ", "implemented", "\\", DQ, ")");
  assert.ok(payload.includes(escapedShape), "fixture must carry the JSON-escaped quotes the old regex missed");
  BLOCK(payload);
});

test(frag("ALLOW: clean real code with braces and the literal word implementation"), { skip: SKIP }, () => {
  ALLOW(writePayload("export function add(a, b) {\n  return a + b;\n}\n"));
  ALLOW(writePayload("const cfg = { retries: 3 };\n// full implementation below\nclass Parser {}\n"));
  ALLOW(editPayload("return computeTotal(items);"));
});

test(frag("ALLOW (fail-open): not-our-shape payload, missing field, empty content"), { skip: SKIP }, () => {
  ALLOW("not valid json at all {{{");                       // parse error -> allow
  ALLOW(JSON.stringify({ tool_input: {} }));                 // no content/new_string -> allow
  ALLOW(JSON.stringify({ tool_input: { content: "" } }));    // empty content -> allow
  ALLOW(JSON.stringify({ tool_input: { command: "ls" } }));  // wrong field (Bash payload) -> allow
});

test(frag("self-gate: a bare project (no manifest) allows a stub write (exit 0)"), { skip: SKIP }, () => {
  const bare = mkdtempSync(join(tmpdir(), "do-stub-bare-"));
  ALLOW(writePayload(M.todoImplement), bare, "no manifest -> hook must no-op");
});
