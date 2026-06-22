const { test } = require("node:test");
const assert = require("node:assert");
const { readFileSync, existsSync, mkdtempSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { execFileSync } = require("node:child_process");
const { tmpdir } = require("node:os");
const ROOT = join(__dirname, "..");
const MOD = join(ROOT, "do", "modules", "agent-team");
const SINK = join(MOD, "do-team", "scripts", "write-local-findings.js");

test("agent-team module.json is valid and wires the env flag", () => {
  const mod = JSON.parse(readFileSync(join(MOD, "module.json"), "utf8"));
  assert.equal(mod.name, "agent-team");
  assert.ok(existsSync(join(MOD, mod.appendFormat)), "format-note exists");
  assert.ok(mod.settingsPartial && existsSync(join(MOD, mod.settingsPartial)), "settingsPartial resolves");
  const partial = JSON.parse(readFileSync(join(MOD, mod.settingsPartial), "utf8"));
  assert.equal(partial.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS, "1");
});

function sampleFindings(dir) {
  const f = join(dir, "findings.json");
  writeFileSync(f, JSON.stringify({ findings: [{
    id: "F1", title: "SQL injection in search", severity: "high", team: "security",
    category: "injection", summary: "user input concatenated into SQL", impact: "data exfiltration",
    remediation: "use parameterized queries",
    evidence: [{ type: "code", value: "query(`...${q}`)", file: "src/db.js", line: 12 }],
    verification: ["payload ' OR 1=1 returns all rows"], references: ["CWE-89"]
  }]}));
  return f;
}

test("local sink renders an issue file + index with expected frontmatter", () => {
  const tmp = mkdtempSync(join(tmpdir(), "do-at-"));
  const findings = sampleFindings(tmp);
  const dir = join(tmp, "issues");
  execFileSync("node", [SINK, "--findings", findings, "--dir", dir], { encoding: "utf8" });
  const issue = readFileSync(join(dir, "ISSUE-F1.md"), "utf8");
  assert.match(issue, /^id: F1$/m);
  assert.match(issue, /^severity: high$/m);
  assert.match(issue, /^status: open$/m);
  assert.match(issue, /SQL injection in search/);
  assert.match(issue, /src\/db\.js:12/);
  assert.match(readFileSync(join(dir, "index.md"), "utf8"), /\| F1 \| SQL injection in search \| high \| open \| injection \|/);
});

test("local sink is idempotent and preserves a user-edited status", () => {
  const tmp = mkdtempSync(join(tmpdir(), "do-at-"));
  const findings = sampleFindings(tmp);
  const dir = join(tmp, "issues");
  execFileSync("node", [SINK, "--findings", findings, "--dir", dir]);
  const p = join(dir, "ISSUE-F1.md");
  writeFileSync(p, readFileSync(p, "utf8").replace("status: open", "status: in-progress"));
  execFileSync("node", [SINK, "--findings", findings, "--dir", dir]);
  assert.match(readFileSync(p, "utf8"), /^status: in-progress$/m, "user status preserved on re-run");
});

test("local sink --dry-run writes nothing", () => {
  const tmp = mkdtempSync(join(tmpdir(), "do-at-"));
  const findings = sampleFindings(tmp);
  const dir = join(tmp, "issues");
  execFileSync("node", [SINK, "--findings", findings, "--dir", dir, "--dry-run"], { encoding: "utf8" });
  assert.equal(existsSync(join(dir, "ISSUE-F1.md")), false);
});

test("local sink rejects a path-traversal id and writes no files outside issues dir", () => {
  const tmp = mkdtempSync(join(tmpdir(), "do-at-"));
  const badFindings = join(tmp, "findings.json");
  writeFileSync(badFindings, JSON.stringify({ findings: [{ id: "../evil", title: "bad", severity: "high" }] }));
  const dir = join(tmp, "issues");
  let threw = false;
  try {
    execFileSync("node", [SINK, "--findings", badFindings, "--dir", dir], { encoding: "utf8" });
  } catch (e) {
    threw = true;
  }
  assert.equal(threw, true, "sink must exit non-zero for a path-traversal id");
  assert.equal(existsSync(join(tmp, "ISSUE-evil.md")), false, "no file written at parent dir");
  assert.equal(existsSync(join(tmp, "evil.md")), false, "no evil.md at parent dir");
});

test("github sink script is present and safe-by-default", () => {
  const src = readFileSync(join(MOD, "do-team", "scripts", "create-gh-issues-from-findings.sh"), "utf8");
  assert.match(src, /--dry-run/, "supports dry-run");
  assert.match(src, /Finding-ID/, "dedups by Finding-ID");
  assert.match(src, /critical\|high\|medium\|low/, "validates severity");
  assert.match(src, /invalid-id-format/, "validates the finding id before using it in a shell command");
  assert.match(src, /would ensure label/, "dry-run creates no labels (no GitHub mutation before confirm)");
});

test("do-team skill has valid frontmatter and states the dry-run/confirm rule", () => {
  // Normalize CRLF -> LF: git autocrlf may re-materialize this tracked file with
  // CRLF on Windows checkout, and the frontmatter assertions anchor on \n.
  const md = readFileSync(join(MOD, "do-team", "SKILL.md"), "utf8").replace(/\r\n/g, "\n");
  assert.match(md, /^---\nname: do-team/, "frontmatter name");
  assert.match(md, /\ndescription: .+/, "has description");
  assert.match(md, /findings\.json/, "documents the contract");
  assert.match(md, /--dry-run/i, "documents dry-run");
  assert.match(md, /confirm/i, "documents user confirmation for the outward sink");
});

test("installing agent-team writes the env flag and the skill bundle", () => {
  const target = mkdtempSync(join(tmpdir(), "do-tgt-"));
  // install reads the plugin from the repo root; point DO_PLUGIN_ROOT at it.
  const prevRoot = process.env.DO_PLUGIN_ROOT;
  try {
    process.env.DO_PLUGIN_ROOT = ROOT;
    delete require.cache[require.resolve("../lib/install")];
    const { install } = require("../lib/install");
    install({ target, modules: ["agent-team"] });

    const settings = JSON.parse(readFileSync(join(target, ".claude", "settings.json"), "utf8"));
    assert.equal(settings.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS, "1");
    assert.ok(existsSync(join(target, ".claude", "skills", "do-team", "SKILL.md")));
    assert.ok(existsSync(join(target, ".claude", "skills", "do-team", "scripts", "write-local-findings.js")));
    assert.ok(existsSync(join(target, ".claude", "skills", "do-team", "assets", "issue.template.md")));
    const manifest = JSON.parse(readFileSync(join(target, ".claude", "do.manifest.json"), "utf8"));
    assert.ok(manifest.modules.includes("agent-team"));
  } finally {
    if (prevRoot === undefined) delete process.env.DO_PLUGIN_ROOT;
    else process.env.DO_PLUGIN_ROOT = prevRoot;
  }
});
