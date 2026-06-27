const { test } = require("node:test");
const assert = require("node:assert");
const { decide } = require("../do/spine/hooks/route-codex-to-skill.cjs");

// Policy contract for the "route Codex through the skill" gate (logic in route-codex-to-skill.cjs).
// decide(cmd) returns a reason STRING to BLOCK, or null to ALLOW. Blocks a direct codex CONSULT
// execution (codex exec / codex.sh) that lacks the skill's marker; allows everything else. The
// self-gate + exit-2 wiring is covered in hooks-self-gate.test.js.
const ALLOW = (cmd) => assert.equal(decide(cmd), null, `expected ALLOW: ${cmd}`);
const BLOCK = (cmd) => assert.equal(typeof decide(cmd), "string", `expected BLOCK: ${cmd}`);

test("non-codex commands are not governed", () => {
  ["", "ls -la", "npm test", "git status", "node server.js", "rm -rf /tmp/x"].forEach(ALLOW);
});

test("INSPECTING codex files is allowed (read / search / syntax-check / tests)", () => {
  [
    "cat skills/codex/codex.sh",
    "grep -r codex skills",
    "bash -n skills/codex/codex.sh",
    "node --test tests/codex-route.test.js",
    "node --test tests/codex-egress-scrub.test.js",
    "less skills/codex/codex.sh",
  ].forEach(ALLOW);
});

test("non-consult codex subcommands are allowed (only `exec` is a scripted consult)", () => {
  ["codex --version", "codex login", "codex --help", "codex resume --last"].forEach(ALLOW);
});

test("direct codex CLI consult is blocked", () => {
  [
    "codex exec",
    "codex exec -",
    "codex e \"what is wrong\"",
    "codex.cmd exec -C .",
    "codex exec --dangerously-bypass-approvals-and-sandbox -",
  ].forEach(BLOCK);
});

test("running codex.sh directly is blocked", () => {
  [
    'bash skills/codex/codex.sh "q"',
    './codex.sh',
    '/c/projects/do/skills/codex/codex.sh',
    '"${CLAUDE_PLUGIN_ROOT}/skills/codex/codex.sh" "the question"',
    'sh skills/codex/codex.sh --decide',
  ].forEach(BLOCK);
});

test("codex behind wrappers / sudo / chains is still blocked", () => {
  [
    "timeout 300 codex exec",
    "timeout 300s codex exec -",
    "sudo codex exec",
    "env FOO=bar codex exec",
    'ls && bash skills/codex/codex.sh "q"',
    'git status; codex exec',
  ].forEach(BLOCK);
});

test("the skill's own run (marker present) is allowed", () => {
  [
    'DO_CODEX_VIA_SKILL=1 bash skills/codex/codex.sh "q"',
    'DO_CODEX_VIA_SKILL=1 "${CLAUDE_PLUGIN_ROOT}/skills/codex/codex.sh"',
    'DO_CODEX_VIA_SKILL=true "${CLAUDE_PLUGIN_ROOT}/skills/codex/codex.sh" --decide "matter"',
    'env DO_CODEX_VIA_SKILL=1 codex exec',
  ].forEach(ALLOW);
});

test("a non-truthy marker does NOT authorize the bypass", () => {
  BLOCK('DO_CODEX_VIA_SKILL=0 bash skills/codex/codex.sh "q"');
});

test("buried-in-a-string codex is not parsed (user's call, like git-gate)", () => {
  ALLOW('bash -c "codex exec -"');
});

test("user kill switch DO_CODEX_ROUTE_OFF disables the gate", () => {
  const prev = process.env.DO_CODEX_ROUTE_OFF;
  try {
    process.env.DO_CODEX_ROUTE_OFF = "1";
    ALLOW("codex exec");
    ALLOW('bash skills/codex/codex.sh "q"');
  } finally {
    if (prev === undefined) delete process.env.DO_CODEX_ROUTE_OFF;
    else process.env.DO_CODEX_ROUTE_OFF = prev;
  }
});
