"use strict";
// Tests for lib/capability-preservation.js (DO-CAP-001 scanner core).
// Fixtures encode the BLOCK/ALLOW matrix from the do:mon DO-CAP-001 consult (ChatGPT Pro).
// Invariant under test: a SYSTEM-absence sentinel presented as complete blocks; an honestly
// surfaced gap, an instance-absence fallback, a pre-existing candidate, and test/doc sentinels pass.

const { test } = require("node:test");
const assert = require("node:assert");
const { evaluate, scanDiff } = require("../lib/capability-preservation");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const LIB = path.join(__dirname, "..", "lib", "capability-preservation.js");
function writeTmp(name, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "docap-"));
  const p = path.join(dir, name);
  fs.writeFileSync(p, content);
  return p;
}

// Build a minimal unified diff that adds `lines` to `file`.
function mkDiff(file, lines) {
  return [
    `diff --git a/${file} b/${file}`,
    `--- a/${file}`,
    `+++ b/${file}`,
    `@@ -1,0 +1,${lines.length} @@`,
    ...lines.map((l) => `+${l}`),
    "",
  ].join("\n");
}

const QS = "src/main/java/com/x/catalog/PublicCatalogProjectionQueryService.java";

// =================================== BLOCK ====================================================

test("F0060: two UNKNOWN sentinels presented as done -> block, two separate candidate ids", () => {
  const diffText = mkDiff(QS, [
    "    .issuanceStrength(Strength.UNKNOWN) // no issuance metric in projection",
    "    .employerDiversity(Strength.UNKNOWN) // the projection has no employer-diversity metric",
  ]);
  const r = evaluate({ diffText, turnText: "Fix applied (F0060). Tests green." });
  assert.equal(r.allow, false);
  assert.equal(r.violations.length, 2);
  assert.equal(new Set(r.violations.map((v) => v.id)).size, 2, "distinct ids per field");
  assert.deepEqual(r.violations.map((v) => v.symbol).sort(), ["employerDiversity", "issuanceStrength"]);
});

test("DTO field set to N/A because the read model lacks a source -> block", () => {
  const diffText = mkDiff("src/main/java/com/x/api/UserProfileDto.java", [
    '    String employerDiversity = "N/A"; // read model lacks an employer-diversity source',
  ]);
  assert.equal(evaluate({ diffText, turnText: "Done." }).allow, false);
});

test("SQL CASE ELSE 'UNKNOWN' until the column exists -> block", () => {
  const diffText = mkDiff("db/top_credential_projection.sql", [
    "    CASE WHEN m.metric IS NULL THEN 'UNKNOWN' ELSE m.metric END AS employer_diversity -- until the metric column exists",
  ]);
  assert.equal(evaluate({ diffText, turnText: "Projection updated." }).allow, false);
});

test("zero fallback with an explicit missing-source rationale -> block (soft stand-in qualifies)", () => {
  const diffText = mkDiff("src/main/java/com/x/service/DiversityService.java", [
    "    int diversityScore = 0; // metric source missing for now",
  ]);
  assert.equal(evaluate({ diffText, turnText: "Shipped." }).allow, false);
});

test("candidate + invented TRACKED id (ungrounded) -> block even with NOT COMPLETE", () => {
  const diffText = mkDiff(QS, ["    .employerDiversity(Strength.UNKNOWN) // no employer-diversity metric in projection"]);
  const turnText = [
    "CAPABILITY STATUS: NOT COMPLETE",
    "CAPABILITY GAP: symbol=employerDiversity | behavior=returns UNKNOWN | disposition=TRACKED:FAKE-999 | evidence=QS.java:9",
  ].join("\n");
  assert.equal(evaluate({ diffText, turnText, groundedIds: [] }).allow, false);
});

test("same-turn ADR cited as sole authority for an expected absence -> block", () => {
  const diffText = mkDiff(QS, ["    .employerDiversity(Strength.UNKNOWN) // no employer-diversity metric in projection"]);
  const turnText =
    "CAPABILITY ABSENCE: symbol=employerDiversity | status=EXPECTED | contract=docs/adr/ADR-0099.md";
  // ADR-0099 was authored THIS turn, so it is not in preexistingContracts.
  assert.equal(evaluate({ diffText, turnText, preexistingContracts: [] }).allow, false);
});

test("disposition BUILD_NOW is not terminal -> block (must keep going, not stop)", () => {
  const diffText = mkDiff(QS, ["    .employerDiversity(Strength.UNKNOWN) // no employer-diversity metric in projection"]);
  const turnText = [
    "CAPABILITY STATUS: NOT COMPLETE",
    "CAPABILITY GAP: symbol=employerDiversity | disposition=BUILD_NOW | evidence=QS.java:9",
  ].join("\n");
  assert.equal(evaluate({ diffText, turnText }).allow, false);
});

// =================================== ALLOW ====================================================

test("projection extended and a real metric mapped -> allow (no sentinel)", () => {
  const diffText = mkDiff(QS, ["    .employerDiversity(computeEmployerDiversity(rs))"]);
  assert.equal(evaluate({ diffText, turnText: "Built the metric." }).allow, true);
});

test("conditional null source -> UNKNOWN (instance absence) -> allow", () => {
  const diffText = mkDiff(QS, [
    "    if (source == null) {",
    "      return Strength.UNKNOWN;",
    "    }",
    "    return computeStrength(source);",
  ]);
  assert.equal(evaluate({ diffText, turnText: "Handled the null input." }).allow, true);
});

test("sentinel only in a test fixture -> allow (excluded path)", () => {
  const diffText = mkDiff("src/test/java/com/x/catalog/CatalogQueryServiceTest.java", [
    "    .employerDiversity(Strength.UNKNOWN) // no metric in projection",
  ]);
  assert.equal(evaluate({ diffText, turnText: "Added a test." }).allow, true);
});

test("sentinel in documentation, not executable code -> allow (excluded path)", () => {
  const diffText = mkDiff("docs/notes.md", ["The field returns UNKNOWN when the projection has no metric."]);
  assert.equal(evaluate({ diffText, turnText: "Documented it." }).allow, true);
});

test("pre-existing dirty candidate, unchanged this turn -> allow (baseline subtraction)", () => {
  const diffText = mkDiff(QS, ["    .employerDiversity(Strength.UNKNOWN) // no employer-diversity metric in projection"]);
  const baseline = scanDiff(diffText).map((c) => c.fingerprint);
  const r = evaluate({ diffText, turnText: "Touched a nearby line.", baseline });
  assert.equal(r.allow, true);
  assert.equal(r.candidates.length, 0);
});

test("unresolved candidate with early NOT COMPLETE + grounded tracker -> allow", () => {
  const diffText = mkDiff(QS, ["    .employerDiversity(Strength.UNKNOWN) // no employer-diversity metric in projection"]);
  const turnText = [
    "CAPABILITY STATUS: NOT COMPLETE",
    "Some explanation of the impact on catalog consumers.",
    "CAPABILITY GAP: symbol=employerDiversity | behavior=returns UNKNOWN | impact=consumers get no strength | cause=projection lacks metric | disposition=TRACKED:F0060-PROJ | evidence=QS.java:9",
  ].join("\n");
  assert.equal(evaluate({ diffText, turnText, groundedIds: ["F0060-PROJ"] }).allow, true);
});

test("expected absence with a pre-existing contract -> allow", () => {
  const diffText = mkDiff(QS, ["    .employerDiversity(Strength.UNKNOWN) // contractually optional"]);
  const turnText =
    "CAPABILITY ABSENCE: symbol=employerDiversity | status=EXPECTED | contract=docs/api/public-catalog.md | proof=CatalogQueryServiceTest.java:211";
  assert.equal(
    evaluate({ diffText, turnText, preexistingContracts: ["docs/api/public-catalog.md"] }).allow,
    true,
  );
});

test("counter initialized to zero with no missing-capability context -> allow", () => {
  const diffText = mkDiff("src/main/java/com/x/service/Counter.java", ["    int count = 0;"]);
  assert.equal(evaluate({ diffText, turnText: "Init the counter." }).allow, true);
});

// =============================== CLI file-mode (the hook interface) ============================

const F0060_DIFF = mkDiff(QS, [
  "    .issuanceStrength(Strength.UNKNOWN) // no issuance metric in projection",
  "    .employerDiversity(Strength.UNKNOWN) // the projection has no employer-diversity metric",
]);

test("CLI --fingerprints prints one fingerprint per candidate", () => {
  const diff = writeTmp("x.diff", F0060_DIFF);
  const r = spawnSync(process.execPath, [LIB, "--fingerprints", "--diff", diff], { encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.equal(r.stdout.split(/\r?\n/).filter(Boolean).length, 2);
});

test("CLI --diff/--turn returns allow=false for a buried F0060", () => {
  const diff = writeTmp("x.diff", F0060_DIFF);
  const turn = writeTmp("turn.txt", "Fix applied (F0060). Tests green.");
  const r = spawnSync(process.execPath, [LIB, "--diff", diff, "--turn", turn], { encoding: "utf8" });
  assert.equal(r.status, 0);
  const v = JSON.parse(r.stdout);
  assert.equal(v.allow, false);
  assert.equal(v.violations.length, 2);
});

test("CLI --baseline subtracts pre-existing candidates -> allow", () => {
  const diff = writeTmp("x.diff", F0060_DIFF);
  const fpRun = spawnSync(process.execPath, [LIB, "--fingerprints", "--diff", diff], { encoding: "utf8" });
  const baseline = writeTmp("base.txt", fpRun.stdout);
  const turn = writeTmp("turn.txt", "Touched a nearby line.");
  const r = spawnSync(process.execPath, [LIB, "--diff", diff, "--turn", turn, "--baseline", baseline], { encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.equal(JSON.parse(r.stdout).allow, true);
});
