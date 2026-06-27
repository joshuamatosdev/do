const { test } = require("node:test");
const assert = require("node:assert");
const { execFileSync } = require("node:child_process");
const { mkdtempSync, mkdirSync, writeFileSync, copyFileSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const { bashEnv, bashPath, repoRoot: ROOT } = require("./bash-paths");

// Stop hook validate-continuation.sh: the SEMANTIC completion gate. It BLOCKS a turn that is
// ending while its own response still lists actionable work, uses a legacy escape tag,
// or hands back passively ("awaiting your direction"). [EXTERNAL-INPUT] = the sole terminal (a credential, or a SAFETY_GATE); [USER] is repealed.
// Discovered work is a frontier to drain, not a future queue. A claimed blocker or repeated
// no-progress escalates with a "Never-Stop-Escalate" reason naming `do:mon`. A RoundLog-backed
// authority decision (terminal-discipline §5/§6 -- bare [USER] is repealed), a clean turn, or the
// hard iteration cap ALLOWS. Faithful test -- runs the bash hook;
// skipped where bash/jq is unavailable.
function has(bin) { try { execFileSync("bash", ["-c", `command -v ${bin}`], { stdio: "ignore" }); return true; } catch { return false; } }
const SKIP = !has("bash") ? "bash unavailable" : (!has("jq") ? "jq unavailable" : false);

const HOOK = "do/spine/hooks/validate-continuation.sh";
const SPEC = join(ROOT, "do", "spine", "RESPONSE-FORMAT.md");
const FRONTIER_STEPS = [
  "1. Finish the requested objective.",
  "2. Classify discovered work.",
  "3. Immediately drain the discovered-work frontier when it is safe, relevant, and tool-executable.",
  "4. Stop only when the frontier contains no worthwhile safe work, or only user-owned/irreversible decisions remain.",
];
const FRONTIER_LOOP = "objective -> required fixes -> verification -> discovered frontier -> drain -> verify -> stop";
const PROCESS_CLEANUP = "Clean up agent-owned processes before stopping.";
function assertFrontierLanguage(out) {
  for (const step of FRONTIER_STEPS) {
    assert.ok(out.includes(step), `reason must include exact frontier step: ${step}`);
  }
  assert.ok(out.includes(FRONTIER_LOOP), "reason must teach the machine execution loop");
  assert.ok(out.includes(PROCESS_CLEANUP), "reason must require cleanup of agent-owned processes");
}

// Temp project WITH the spec (self-gate passes).
function project() {
  const t = mkdtempSync(join(tmpdir(), "do-cont-"));
  mkdirSync(join(t, ".claude"), { recursive: true });
  copyFileSync(SPEC, join(t, ".claude", "RESPONSE-FORMAT.md"));
  return t;
}
// Temp project WITHOUT the spec (self-gate -> fail-open).
function projectNoSpec() {
  const t = mkdtempSync(join(tmpdir(), "do-cont-ns-"));
  mkdirSync(join(t, ".claude"), { recursive: true });
  return t;
}

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
  return bashPath(f);
}

// Seed the per-session state file. sid = basename(transcript) = "t.jsonl" (no session_id in input).
function seedState(dir, obj) {
  const sdir = join(dir, ".claude", "state", "continuation");
  mkdirSync(sdir, { recursive: true });
  writeFileSync(join(sdir, "t.jsonl.json"), JSON.stringify(obj));
}

// Run the hook; return raw stdout ("" -> allow; contains "block" -> block).
function run(dir, tf, stopActive = false) {
  const input = JSON.stringify({ transcript_path: tf, stop_hook_active: stopActive });
  return execFileSync("bash", [HOOK], {
    cwd: ROOT,
    input,
    env: bashEnv({ CLAUDE_PROJECT_DIR: bashPath(dir) }),
  }).toString();
}
const isBlock = (out) => out.includes('"block"');

const RS = (body) => `## Remaining Steps\n${body}`;

// A well-formed RoundLog (terminal-discipline §5) — the earned-terminal contract the gate now
// requires before an [EXTERNAL-INPUT] authority decision may end the turn. The hook checks for
// the distinctive keys RoundLog / trials / converged / concurrence.
const ROUNDLOG =
  "\n\n```RoundLog\n" +
  "candidate: approve the production deploy\n" +
  "trials: internal-reasoner no-action; consult-reasoner no-action; adversarial-review no-action; creative-analysis no-action; driven-directive no-action\n" +
  "converged: true\n" +
  "concurrence: adversarial = no-action\n" +
  "```";

test("open '- [ ]' with no progress -> BLOCK (layer 1, not escalate)", { skip: SKIP }, () => {
  const d = project();
  const tf = transcript(d, [
    { role: "user", text: "do the thing" },
    { role: "assistant", text: RS("- [ ] wire the live reads\n- [ ] add tests") },
  ]);
  const out = run(d, tf);
  assert.equal(isBlock(out), true, "actionable open work must block");
  assertFrontierLanguage(out);
  assert.ok(!out.includes("Never-Stop-Escalate"), "first nudge is layer-1, not escalation");
});

test("'awaiting your direction' + open work -> BLOCK", { skip: SKIP }, () => {
  const d = project();
  const tf = transcript(d, [
    { role: "user", text: "do the thing" },
    { role: "assistant", text: RS("- [ ] finish wiring") + "\n\nawaiting your direction on the rest." },
  ]);
  assert.equal(isBlock(run(d, tf)), true);
});

// --- Owner act-and-finish policy: ANY literal '?' in the turn fires the gate. -----------------
test("ends by asking the user (?) -> BLOCK (act-and-finish policy)", { skip: SKIP }, () => {
  const d = project();
  const tf = transcript(d, [
    { role: "user", text: "do the thing" },
    { role: "assistant", text: "Done the first part. Would you like me to commit it?" },
  ]);
  const out = run(d, tf);
  assert.equal(isBlock(out), true, "any question mark in the turn must fire the gate");
  assert.ok(out.includes("act-and-finish"), "reason must name the act-and-finish policy");
});

test("question mark fires even an otherwise-clean ([x]) turn", { skip: SKIP }, () => {
  const d = project();
  const tf = transcript(d, [
    { role: "user", text: "do the thing" },
    { role: "assistant", text: RS("- [x] shipped, tests green") + "\n\nIs this what you wanted?" },
  ]);
  assert.equal(isBlock(run(d, tf)), true, "a '?' blocks even when all work is done");
});

test("clean turn with NO question mark -> still ALLOW (regression)", { skip: SKIP }, () => {
  const d = project();
  const tf = transcript(d, [
    { role: "user", text: "do the thing" },
    { role: "assistant", text: RS("- [x] shipped, tests green") + "\n\nAll done." },
  ]);
  assert.equal(isBlock(run(d, tf)), false, "no '?' and no open work -> allow");
});

// --- A '?' that lives ONLY in CODE is not a question to the user; strip code spans first. -------
test("done turn whose only '?' is in an inline code span -> ALLOW (not a real question)", { skip: SKIP }, () => {
  const d = project();
  const tf = transcript(d, [
    { role: "user", text: "do the thing" },
    // The single '?' is inside a backtick code span (optional chaining), not prose.
    { role: "assistant", text: RS("- [x] shipped, tests green") + "\n\nGuarded the access with `user?.name ?? fallback`." },
  ]);
  assert.equal(isBlock(run(d, tf)), false, "a '?' confined to a code span must not fire the gate");
});

test("done turn whose only '?' is in a fenced code block -> ALLOW", { skip: SKIP }, () => {
  const d = project();
  const tf = transcript(d, [
    { role: "user", text: "do the thing" },
    { role: "assistant", text: RS("- [x] shipped, tests green") + "\n\nApplied:\n```ts\nconst v = a?.b ?? c;\n```\nDone." },
  ]);
  assert.equal(isBlock(run(d, tf)), false, "a '?' confined to a fenced block must not fire the gate");
});

test("genuine prose question still BLOCKs even when code spans are present", { skip: SKIP }, () => {
  const d = project();
  const tf = transcript(d, [
    { role: "user", text: "do the thing" },
    // Code span carries its own '?', but the real prose question after it must still fire.
    { role: "assistant", text: RS("- [x] shipped") + "\n\nUsed `a?.b` here. Should I deploy it now?" },
  ]);
  const out = run(d, tf);
  assert.equal(isBlock(out), true, "a real prose '?' must still fire even alongside a code span");
  assert.ok(out.includes("act-and-finish"), "reason must name the act-and-finish policy");
});

test("authority decision phrased WITHOUT a '?', WITH a RoundLog -> ALLOW (regression)", { skip: SKIP }, () => {
  const d = project();
  const tf = transcript(d, [
    { role: "user", text: "do it" },
    { role: "assistant", text: RS("- [ ] [EXTERNAL-INPUT] approve the production deploy") + ROUNDLOG },
  ]);
  assert.equal(isBlock(run(d, tf)), false, "a real authority decision with no '?', earned with a RoundLog, releases the gate");
});

test("all '- [x]' + evidence, clean -> ALLOW", { skip: SKIP }, () => {
  const d = project();
  const tf = transcript(d, [
    { role: "user", text: "do the thing" },
    { role: "assistant", text: RS("- [x] None — shipped, :admin:test 16 passing") },
  ]);
  assert.equal(isBlock(run(d, tf)), false);
});

test("all open items authority-tagged, WITH a RoundLog -> ALLOW", { skip: SKIP }, () => {
  const d = project();
  const tf = transcript(d, [
    { role: "user", text: "do the thing" },
    { role: "assistant", text: RS("- [ ] [EXTERNAL-INPUT] approve the production deploy") + ROUNDLOG },
  ]);
  assert.equal(isBlock(run(d, tf)), false);
});

test("[DO:MON] design decision -> BLOCK with external-reasoner brief", { skip: SKIP }, () => {
  const d = project();
  const tf = transcript(d, [
    { role: "user", text: "optimize the workflow" },
    { role: "assistant", text: RS("- [ ] [DO:MON] decide the long-term scalable stop-hook workflow") },
  ]);
  const out = run(d, tf);
  assert.equal(isBlock(out), true, "DO:MON decisions require an automated reasoner consult before stopping");
  assert.match(out, /DO:MON/);
  assert.match(out, /do:mon/);
  assert.match(out, /provide code/i);
  assert.match(out, /definition of done/i);
  assert.match(out, /acceptance criteria/i);
  assert.match(out, /trade-?offs/i);
  assert.match(out, /long-term scalable/i);
});

test("[EXTERNAL-INPUT] technical design decision -> BLOCK and reroute to DO:MON", { skip: SKIP }, () => {
  const d = project();
  const tf = transcript(d, [
    { role: "user", text: "optimize the workflow" },
    { role: "assistant", text: RS("- [ ] [EXTERNAL-INPUT] decide the architecture tradeoff for long-term scalability") },
  ]);
  const out = run(d, tf);
  assert.equal(isBlock(out), true, "technical design decisions must not be parked on the user");
  assert.match(out, /DO:MON/);
  assert.match(out, /technical design decision/i);
});

test("legacy escape-tagged open item -> BLOCK", { skip: SKIP }, () => {
  const legacyTag = `[${"LATER"}]`;
  const d = project();
  const tf = transcript(d, [
    { role: "user", text: "do the thing" },
    { role: "assistant", text: RS(`- [ ] ${legacyTag} propagate the change to the other installs`) },
  ]);
  const out = run(d, tf);
  assert.equal(isBlock(out), true, "legacy escape tag must block because discovered work is frontier work");
  assertFrontierLanguage(out);
});

test("open work alongside a legacy escape item -> BLOCK and treats both as frontier work", { skip: SKIP }, () => {
  const legacyTag = `[${"LATER"}]`;
  const d = project();
  const tf = transcript(d, [
    { role: "user", text: "do the thing" },
    { role: "assistant", text: RS(`- [ ] finish the in-scope wiring\n- [ ] ${legacyTag} nice-to-have refactor`) },
  ]);
  const out = run(d, tf);
  assert.equal(isBlock(out), true, "open work must block without a legacy escape hatch");
  assertFrontierLanguage(out);
});

test("claimed blocker -> BLOCK with escalate reason naming do:mon", { skip: SKIP }, () => {
  const d = project();
  const tf = transcript(d, [
    { role: "user", text: "do the thing" },
    { role: "assistant", text: RS("- [ ] regenerate the client") + "\n\nThis is blocked on the foreign /v3/api-docs 500 — not mine." },
  ]);
  const out = run(d, tf);
  assert.equal(isBlock(out), true);
  assert.ok(out.includes("do:mon"), "blocker must route to do:mon");
  assert.ok(out.includes("Never-Stop-Escalate"), "blocker is a layer-2 escalation");
});

test("stuck (stall seeded) -> escalate even without a blocker phrase", { skip: SKIP }, () => {
  const d = project();
  seedState(d, { blocks: 2, stall: 2, lastToolCount: 0 });
  const tf = transcript(d, [
    { role: "user", text: "do the thing" },
    { role: "assistant", text: RS("- [ ] keep going on the migration") },
  ]);
  const out = run(d, tf);
  assert.equal(isBlock(out), true);
  assert.ok(out.includes("do:mon"), "repeated no-progress escalates to do:mon");
});

test("hard cap reached -> ALLOW (failsafe, never loops)", { skip: SKIP }, () => {
  const d = project();
  seedState(d, { blocks: 25, stall: 5, lastToolCount: 0 }); // MAX=25 -> blocks_new=26 > cap
  const tf = transcript(d, [
    { role: "user", text: "do the thing" },
    { role: "assistant", text: RS("- [ ] still more work") },
  ]);
  assert.equal(isBlock(run(d, tf)), false);
});

test("no spec file -> ALLOW (self-gate fail-open)", { skip: SKIP }, () => {
  const d = projectNoSpec();
  const tf = transcript(d, [
    { role: "user", text: "do the thing" },
    { role: "assistant", text: RS("- [ ] open work but no doctrine installed") },
  ]);
  assert.equal(isBlock(run(d, tf)), false);
});

test("trivial clean turn -> ALLOW", { skip: SKIP }, () => {
  const d = project();
  const tf = transcript(d, [
    { role: "user", text: "hi" },
    { role: "assistant", text: "Hello, all done." },
  ]);
  assert.equal(isBlock(run(d, tf)), false);
});

test("stop_hook_active=true still blocks open work (deliberately unlike the format gate)", { skip: SKIP }, () => {
  const d = project();
  const tf = transcript(d, [
    { role: "user", text: "do the thing" },
    { role: "assistant", text: RS("- [ ] more to do") },
  ]);
  assert.equal(isBlock(run(d, tf, true)), true, "continuation must survive a re-prompt to keep pushing");
});

test("progress made (tool calls) -> still BLOCK but resets stall (layer 1)", { skip: SKIP }, () => {
  const d = project();
  seedState(d, { blocks: 1, stall: 1, lastToolCount: 0 }); // prior stall; this turn shows a tool_use
  const tf = transcript(d, [
    { role: "user", text: "do the thing" },
    { role: "assistant", tool: "Edit", input: { file_path: "x.ts" } },
    { role: "assistant", text: RS("- [ ] one more step") },
  ]);
  const out = run(d, tf);
  assert.equal(isBlock(out), true);
  assert.ok(!out.includes("Never-Stop-Escalate"), "progress resets stall -> stays layer-1, no escalation");
});

test("[EXTERNAL-INPUT] on a doable ACTION (restart) -> BLOCK (no handing your own work back)", { skip: SKIP }, () => {
  const d = project();
  const tf = transcript(d, [
    { role: "user", text: "fix it" },
    { role: "assistant", text: RS("- [ ] [EXTERNAL-INPUT] Restart the backend — it crashed under host load") },
  ]);
  const out = run(d, tf);
  assert.equal(isBlock(out), true, "an [EXTERNAL-INPUT] item that is really a doable action must not end the turn");
  assert.ok(!out.includes("Never-Stop-Escalate"), "first nudge is layer-1, not escalation");
});

test("[EXTERNAL-INPUT] on a doable ACTION (commit) -> BLOCK", { skip: SKIP }, () => {
  const d = project();
  const tf = transcript(d, [
    { role: "user", text: "do it" },
    { role: "assistant", text: RS("- [ ] [EXTERNAL-INPUT] commit the resync script when ready") },
  ]);
  assert.equal(isBlock(run(d, tf)), true);
});

test("genuine DECISION (approve) WITH a RoundLog -> ALLOW (real escalation preserved)", { skip: SKIP }, () => {
  const d = project();
  const tf = transcript(d, [
    { role: "user", text: "do it" },
    { role: "assistant", text: RS("- [ ] [EXTERNAL-INPUT] approve the production deploy") + ROUNDLOG },
  ]);
  assert.equal(isBlock(run(d, tf)), false, "a real authority decision, earned with a RoundLog, must still release the gate");
});

test("decision that mentions an action verb (which DB to restart), WITH a RoundLog -> ALLOW (decision word wins)", { skip: SKIP }, () => {
  const d = project();
  const tf = transcript(d, [
    { role: "user", text: "do it" },
    { role: "assistant", text: RS("- [ ] [EXTERNAL-INPUT] decide which service to restart first") + ROUNDLOG },
  ]);
  assert.equal(isBlock(run(d, tf)), false, "decision phrasing exempts even when an action verb appears, once earned with a RoundLog");
});

test("[EXTERNAL-INPUT] flip-gate build-vs-defer handoff -> BLOCK (agent-created gate is frontier work)", { skip: SKIP }, () => {
  const d = project();
  const tf = transcript(d, [
    { role: "user", text: "finish and land the whole feature" },
    {
      role: "assistant",
      text: RS("- [ ] [EXTERNAL-INPUT] decide whether to build the flip-gates now or leave them deferred until cutover is scheduled"),
    },
  ]);
  const out = run(d, tf);
  assert.equal(isBlock(out), true, "agent-runnable rollout prerequisites must not be hidden as a user choice");
  assert.ok(out.includes("agent-created gate"), "reason should name the invented-gate handoff");
});

// --- terminal-discipline §5/§6: a terminal is admissible ONLY with a RoundLog. -----------------
// §6 RED fixture for "defining the gate": the gate MUST reject an unearned terminal. This negative
// case is the falsifier that makes the wiring claim itself falsifiable.
test("authority decision WITHOUT a RoundLog -> BLOCK (INADMISSIBLE, §6 RED fixture)", { skip: SKIP }, () => {
  const d = project();
  const tf = transcript(d, [
    { role: "user", text: "do it" },
    { role: "assistant", text: RS("- [ ] [EXTERNAL-INPUT] approve the production deploy") },
  ]);
  const out = run(d, tf);
  assert.equal(isBlock(out), true, "a bare terminal with no RoundLog is unearned -> INADMISSIBLE");
  assert.ok(out.includes("INADMISSIBLE"), "reason must name the terminal as INADMISSIBLE");
  assert.ok(out.includes("RoundLog"), "reason must require the RoundLog");
  assert.ok(out.includes("terminal-discipline"), "reason must point at terminal-discipline");
});

// §6 RED fixture for the [USER] repeal. The banned token appears ONLY here, as a negative case the
// gate MUST reject — never as an allowed terminal. Even carrying a RoundLog, [USER] never earns the
// terminal: using the repealed token is itself the violation. This is the falsifier for the repeal.
test("[USER] tag is REPEALED -> BLOCK even with a RoundLog (banned token)", { skip: SKIP }, () => {
  const d = project();
  const tf = transcript(d, [
    { role: "user", text: "do it" },
    { role: "assistant", text: RS("- [ ] [USER] approve the production deploy") + ROUNDLOG },
  ]);
  const out = run(d, tf);
  assert.equal(isBlock(out), true, "the repealed [USER] token must never end the turn, RoundLog or not");
  assert.ok(out.includes("REPEALED"), "reason must name [USER] as REPEALED");
});
