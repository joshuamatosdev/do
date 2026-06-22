const { test } = require("node:test");
const assert = require("node:assert");
const { existsSync, readdirSync, statSync, readFileSync } = require("node:fs");
const { join } = require("node:path");

const SKILLS = join(__dirname, "..", "skills");

// Every directory under skills/ is a shipped skill. Each one MUST hold a
// SKILL.md — a skill folder without one is a packaging error, so we list all
// directories here and assert the file below rather than filtering the gap away.
function skillDirs() {
  return readdirSync(SKILLS)
    .filter((d) => statSync(join(SKILLS, d)).isDirectory());
}

// Frontmatter field rules (name, description, kebab, length, no unknown keys)
// live in the strict schema — see frontmatter.test.js. This file holds only the
// structural checks: every skill directory carries a SKILL.md, and the expected
// skills are present on disk.
test("skills: every skill directory has a SKILL.md", () => {
  const dirs = skillDirs();
  assert.ok(dirs.length >= 1, "expected at least one shipped skill");
  const missing = dirs.filter((d) => !existsSync(join(SKILLS, d, "SKILL.md")));
  assert.deepEqual(missing, [], `skill directories without a SKILL.md: ${missing.join(", ")}`);
});

test("skills: the imported skills are present", () => {
  const dirs = skillDirs();
  // A spot-check that the import landed: these must be present.
  for (const expected of ["commit-skeptic", "plan-skeptic", "codebase-cartography", "user-value-chain", "bb-methodology", "security-arsenal", "red-blue"]) {
    assert.ok(dirs.includes(expected), `missing imported skill: ${expected}`);
  }
});

// Regression for the dead-skill cluster: a skill that points at `do:<name>` which
// names neither a shipped skill nor an agent routes users to a broken workflow.
test("skills: every do: reference resolves to a shipped skill or agent", () => {
  const skillNames = new Set(skillDirs());
  const AGENTS = join(__dirname, "..", "agents");
  const agentNames = new Set(
    existsSync(AGENTS) ? readdirSync(AGENTS).filter((f) => f.endsWith(".md")).map((f) => f.replace(/\.md$/, "")) : []
  );
  const known = new Set([...skillNames, ...agentNames]);
  const dangling = [];
  for (const d of skillDirs()) {
    const p = join(SKILLS, d, "SKILL.md");
    if (!existsSync(p)) continue;
    for (const ref of (readFileSync(p, "utf8").match(/\bdo:[a-z][a-z0-9-]*/g) || [])) {
      if (!known.has(ref.slice(3))) dangling.push(`${d}: ${ref}`);
    }
  }
  assert.deepEqual(dangling, [], `dangling do: references (no such skill/agent): ${dangling.join("; ")}`);
});

// Catches bare/slash references the do: scan misses (e.g. `/triage-validation`, `web2-vuln-classes`).
test("skills: removed/unshipped skills are not referenced in any form", () => {
  const removed = ["triage-validation", "web2-vuln-classes"];
  const hits = [];
  for (const d of skillDirs()) {
    const p = join(SKILLS, d, "SKILL.md");
    if (!existsSync(p)) continue;
    const text = readFileSync(p, "utf8");
    for (const name of removed) if (text.includes(name)) hits.push(`${d}: ${name}`);
  }
  assert.deepEqual(hits, [], `references to removed/unshipped skills: ${hits.join("; ")}`);
});
