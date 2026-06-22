const { test } = require("node:test");
const assert = require("node:assert");
const { execFileSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const { createHash } = require("node:crypto");
const { join } = require("node:path");

const ROOT = join(__dirname, "..", "skills", "report-writing", "scripts", "report-engine");
const CLI = join(ROOT, "src", "cli.js");
const FIXTURE = join(ROOT, "fixtures", "sample-report.json");
const GOLDEN = join(ROOT, "fixtures", "sample-report.expected.sha256");

function render() {
  return execFileSync("node", [CLI, "render", FIXTURE], { encoding: "utf8" });
}
const sha = (s) => createHash("sha256").update(s).digest("hex");

test("report schema: customSections title is a typed subschema, not a string literal", () => {
  const raw = readFileSync(join(ROOT, "report.schema.json"), "utf8");
  assert.ok(!/"title":\s*"Additional"/.test(raw), 'the malformed "title": "Additional" literal must be gone');
  const t = JSON.parse(raw).properties.customSections.items.properties.title;
  assert.deepEqual(t, { type: "string" }, "customSections[].title must be a {type:string} subschema");
});

test("report-engine: sample fixture validates", () => {
  const out = execFileSync("node", [CLI, "validate", FIXTURE], { encoding: "utf8" });
  assert.match(out, /VALID/);
});

test("report-engine: render is deterministic (byte-for-byte across runs)", () => {
  assert.equal(sha(render()), sha(render()));
});

test("report-engine: render matches the committed golden hash", () => {
  const golden = readFileSync(GOLDEN, "utf8").trim();
  assert.equal(sha(render()), golden);
});

test("report-engine: output is a self-contained HTML doc with inlined CSS", () => {
  const html = render();
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<style>/);
  assert.ok(!/<link[^>]+stylesheet/i.test(html), "must not link external stylesheets");
});

test("report-engine: data-driven audiences render from the payload", () => {
  const html = render();
  // audienceNotes is an open list; the sample uses three lenses.
  assert.match(html, /distinguished-engineer lens/);
  assert.match(html, /system-engineer lens/);
  assert.match(html, /tech-lead lens/);
});

test("report-engine: custom sections render", () => {
  assert.match(render(), /Cost Note/);
});

test("report-engine: invalid payload exits non-zero", () => {
  assert.throws(() => {
    execFileSync("node", [CLI, "validate", __filename], { encoding: "utf8", stdio: "pipe" });
  });
});

// ── Review-hardening: custom-section evidence, data-driven lenses ──────────────

const { mkdtempSync, writeFileSync, cpSync } = require("node:fs");
const { tmpdir } = require("node:os");
function payload() { return JSON.parse(readFileSync(FIXTURE, "utf8")); }
function writeTmp(obj) { const f = join(mkdtempSync(join(tmpdir(), "do-re-")), "p.json"); writeFileSync(f, JSON.stringify(obj)); return f; }

test("report-engine: a custom-section claim without evidence is rejected", () => {
  const p = payload();
  p.customSections = [{ title: "X", items: [{ statement: "no evidence here" }] }];
  assert.throws(() => execFileSync("node", [CLI, "validate", writeTmp(p)], { encoding: "utf8", stdio: "pipe" }));
});

test("report-engine: meta.lenses overrides a section's lens label", () => {
  const p = payload();
  p.meta.lenses = { executiveVerdict: "board" };
  const html = execFileSync("node", [CLI, "render", writeTmp(p)], { encoding: "utf8" });
  assert.match(html, /<span class="lens">board<\/span>/);
});

// Install-path coverage (Codex review): the skill invokes the engine via
// ${CLAUDE_SKILL_DIR}, which on a real machine can contain spaces
// (e.g. a path with spaces). Copy the whole engine to a spaced path and
// prove it still resolves its sibling schema/templates and runs.
test("report-engine: runs when installed under a path containing spaces", () => {
  const dst = join(mkdtempSync(join(tmpdir(), "do re ")), "report engine");
  cpSync(ROOT, dst, { recursive: true });
  const out = execFileSync("node", [join(dst, "src", "cli.js"), "validate", FIXTURE], { encoding: "utf8" });
  assert.match(out, /VALID/);
});
