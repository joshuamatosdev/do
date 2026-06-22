const { test } = require("node:test");
const assert = require("node:assert");
const { parseYaml } = require("../tools/yaml-lite.js");
const { loadTemplate, splitSections, scoreSpec, countBullets, tableRows, countParagraphs } = require("../tools/adr-spec-rubric.js");

// ── rubric hardening: repeating sections (Domain Component pattern) ──
test("rubric: a repeating block with no id_prefix records a gap and does not throw", () => {
  const tpl = { sections: [ { n: 1, title: "Domain X", required: true,
    repeating: { count: { floor: 1 }, per_item: [] } } ] };
  const md = "## 1. Domain X\n\nReal content that is comfortably longer than the stub threshold here.";
  let r;
  assert.doesNotThrow(() => { r = scoreSpec(md, tpl); });
  assert.ok(r.gaps.some((g) => /no id_prefix/.test(g.reason)), "missing id_prefix is a named gap");
});

test("rubric: a code block inside a repeating per_item is scored by fenced detection", () => {
  const tpl = { sections: [ { n: 1, title: "Domain X", required: true,
    repeating: { id_prefix: "DC-", count: { floor: 1 }, per_item: [ { kind: "code", title: "Contract" } ] } } ] };
  const withFence = "## 1. Domain X\n\nintro line long enough not to be a stub at all here.\n\n### DC-1\n\n### Contract\n\n```\nthe contract\n```\n";
  const noFence   = "## 1. Domain X\n\nintro line long enough not to be a stub at all here.\n\n### DC-1\n\n### Contract\n\njust prose, no fenced block";
  const good = scoreSpec(withFence, tpl);
  const bad = scoreSpec(noFence, tpl);
  assert.ok(good.covered > bad.covered, "the fenced Contract is credited; missing it is not");
  assert.ok(bad.gaps.some((g) => /Contract|code/.test(g.block)), "missing fenced code is a named gap");
});

test("yaml-lite: scalars, ints, bools", () => {
  const o = parseYaml(`name: hi\nn: 7\nok: true\nno: false`);
  assert.deepStrictEqual(o, { name: "hi", n: 7, ok: true, no: false });
});

test("yaml-lite: nested mapping by indent", () => {
  const o = parseYaml(`a:\n  b:\n    c: 1`);
  assert.deepStrictEqual(o, { a: { b: { c: 1 } } });
});

test("yaml-lite: block sequence of scalars", () => {
  const o = parseYaml(`rows:\n  - one\n  - two`);
  assert.deepStrictEqual(o, { rows: ["one", "two"] });
});

test("yaml-lite: sequence of mappings", () => {
  const o = parseYaml(`sections:\n  - n: 1\n    title: "A"\n  - n: 2\n    title: "B"`);
  assert.deepStrictEqual(o, { sections: [ { n: 1, title: "A" }, { n: 2, title: "B" } ] });
});

test("yaml-lite: recursive inline flow map", () => {
  const o = parseYaml(`p: { floor: 2, target: 2, s: { floor: 3, target: 4 } }`);
  assert.deepStrictEqual(o, { p: { floor: 2, target: 2, s: { floor: 3, target: 4 } } });
});

test("yaml-lite: inline flow sequence", () => {
  const o = parseYaml(`columns: [Field, Value]`);
  assert.deepStrictEqual(o, { columns: ["Field", "Value"] });
});

test("yaml-lite: line and inline comments stripped outside quotes", () => {
  const o = parseYaml(`# a comment\nname: hi   # trailing\nq: "a # not a comment"`);
  assert.deepStrictEqual(o, { name: "hi", q: "a # not a comment" });
});

test("yaml-lite: folded block scalar consumed opaquely", () => {
  const o = parseYaml(`k:\n  instr: >\n    line one\n    line two\n  n: 5`);
  assert.strictEqual(o.k.n, 5);
  assert.match(o.k.instr, /line one/);
  assert.match(o.k.instr, /line two/);
});

const fs = require("node:fs");
const path = require("node:path");
const TEMPLATE = path.join(__dirname, "..", "skills", "adr", "templates", "adr-implementation-spec.template.yaml");

test("template: parses and has >= 20 sections with sane floors", () => {
  const tpl = parseYaml(fs.readFileSync(TEMPLATE, "utf8"));
  assert.ok(tpl.template, "has template meta");
  assert.strictEqual(tpl.template.section_floor, 20);
  assert.ok(Array.isArray(tpl.sections), "sections is a list");
  assert.ok(tpl.sections.length >= 20, `>= 20 sections, got ${tpl.sections.length}`);
  // Section 1 Executive Direction: non-negotiable decisions floor 3, target 7
  const s1 = tpl.sections.find((s) => s.n === 1);
  assert.strictEqual(s1.title, "Executive Direction");
  const nn = s1.blocks.find((b) => b.title === "Non-negotiable product decisions");
  assert.deepStrictEqual(nn.items, { floor: 3, target: 7 });
  // metadata table columns mirror the golden
  assert.deepStrictEqual(tpl.metadata_table.columns, ["Field", "Value"]);
  assert.ok(tpl.metadata_table.rows.includes("Primary audience"));
});

// ── Task 3: rubric scorer — section presence + non-stub ──────────────────────

test("rubric: splitSections strips number prefix", () => {
  const m = `## 1. Executive Direction\nbody a\n## 2. Scope\nbody b`;
  const map = splitSections(m);
  assert.ok(map.has("Executive Direction"));
  assert.ok(map.has("Scope"));
  assert.match(map.get("Executive Direction"), /body a/);
});

test("rubric: a near-empty spec scores low and names the gaps", () => {
  const tpl = loadTemplate(TEMPLATE);
  const r = scoreSpec(`## 1. Executive Direction\n(stub)`, tpl);
  assert.ok(r.percent < 20, `expected low, got ${r.percent}`);
  assert.ok(r.gaps.some((g) => /Risk Register/.test(g.section)), "missing Risk Register is a gap");
});

// ── Task 4: rubric scorer — per-section block floors ─────────────────────────

test("rubric: countBullets under a subhead", () => {
  const body = `### Non-negotiable product decisions\n- a\n- b\n- c\n### Other\n- z`;
  assert.strictEqual(countBullets(body, "Non-negotiable product decisions"), 3);
});

test("rubric: tableRows matches by column header", () => {
  const body = `| ID | Decision | Instruction |\n| --- | --- | --- |\n| D-1 | x | y |\n| D-2 | a | b |`;
  assert.strictEqual(tableRows(body, ["ID", "Decision", "Instruction"]), 2);
  assert.strictEqual(tableRows(body, ["Nope"]), -1);
});

// Fix 1: near-miss header must not match (substring false-positive)
test("rubric: tableRows rejects a near-miss header (exact cell match required)", () => {
  // "GRID" contains "ID", "Decisions" contains "Decision", "Instructions" contains "Instruction"
  // — substring match would accept this; exact cell match must reject it
  const body = `| GRID | Decisions | Instructions |\n| --- | --- | --- |\n| x | y | z |`;
  assert.strictEqual(tableRows(body, ["ID", "Decision", "Instruction"]), -1);
});

// Fix 2: blank line between two tables must stop row counting at the first table
test("rubric: tableRows stops counting at the first blank line after the separator", () => {
  // Two adjacent tables share the same column names; only the first table's rows should count
  const body = [
    "| A | B |",
    "| --- | --- |",
    "| r1a | r1b |",
    "| r2a | r2b |",
    "",
    "| A | B |",
    "| --- | --- |",
    "| r3a | r3b |",
  ].join("\n");
  // Must return 2 (only the first table), not 3 (both tables merged)
  assert.strictEqual(tableRows(body, ["A", "B"]), 2);
});

test("rubric: a full fixture spec scores 100", () => {
  const tpl = loadTemplate(TEMPLATE);
  const full = fs.readFileSync(path.join(__dirname, "fixtures", "adr-spec.full.md"), "utf8");
  const r = scoreSpec(full, tpl);
  assert.strictEqual(r.percent, 100, JSON.stringify(r.gaps, null, 2));
});

test("rubric: dropping the Rejected alternatives table lowers the score", () => {
  const tpl = loadTemplate(TEMPLATE);
  const full = fs.readFileSync(path.join(__dirname, "fixtures", "adr-spec.full.md"), "utf8");
  const broken = full.replace(/### Rejected alternatives[\s\S]*?(?=\n### |\n## )/, "");
  const r = scoreSpec(broken, tpl);
  assert.ok(r.percent < 100);
  assert.ok(r.gaps.some((g) => /Rejected alternatives/.test(g.block)));
});

// Fix 3: a conditional section that the author INCLUDED must be scored
test("rubric: included conditional section is scored (stub is flagged as a gap)", () => {
  const tpl = loadTemplate(TEMPLATE);
  // Inject a stub Domain Workflow Specification section into the minimal spec
  // It is required: false in the template — but because it is present, it must be scored
  const spec = `## 9. Domain Workflow Specification\n(stub)\n## 20. Final Release Gate\nPlaceholder text here that is long enough to not be a stub by character count alone.\n### Sign-off checklist\n- item one\n- item two\n- item three\n- item four\n- item five\n`;
  const r = scoreSpec(spec, tpl);
  // The section IS present but is a stub — must appear in gaps
  assert.ok(r.gaps.some((g) => g.section === "Domain Workflow Specification"), `expected gap for included stub conditional section; got ${JSON.stringify(r.gaps)}`);
});

// ── Task 5: state store — safe, resumable ────────────────────────────────────

// Scratch goes to the OS temp dir, never the repo tree (mkdtempSync creates a unique dir).
const TMP_DIR = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "do-adr-spec-"));
const { emptyState, writeState, readState } = require("../tools/adr-spec-state.js");

test("state: roundtrip", () => {
  const f = path.join(TMP_DIR, `adr-state-${process.pid}-roundtrip.json`);
  const s = emptyState("example"); s.percent = 42;
  writeState(f, s);
  assert.deepStrictEqual(readState(f), s);
});

test("state: missing file returns null", () => {
  assert.strictEqual(readState(path.join(TMP_DIR, "nope-does-not-exist.json")), null);
});

test("state: corrupt JSON returns null (no throw)", () => {
  const f = path.join(TMP_DIR, `adr-bad-${process.pid}-corrupt.json`);
  fs.writeFileSync(f, "{ not json");
  assert.strictEqual(readState(f), null);
});
