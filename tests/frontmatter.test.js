const { test } = require("node:test");
const assert = require("node:assert");
const { readFileSync, readdirSync, existsSync, statSync } = require("node:fs");
const { join } = require("node:path");
const { validateFrontmatter } = require("../tools/frontmatter-schema");

const ROOT = join(__dirname, "..");
const SKILLS = join(ROOT, "skills");
const AGENTS = join(ROOT, "agents");

function skillDirs() {
  return readdirSync(SKILLS)
    .filter((d) => statSync(join(SKILLS, d)).isDirectory())
    .filter((d) => existsSync(join(SKILLS, d, "SKILL.md")));
}

function agentFiles() {
  return existsSync(AGENTS) ? readdirSync(AGENTS).filter((f) => f.endsWith(".md")) : [];
}

// A long-enough, valid agent block; tests mutate one field at a time off this.
const OK_DESC = "x".repeat(50);
const agentBlock = (fm) => {
  const f = { name: "foo", description: OK_DESC, model: "inherit", color: "cyan", tools: ['"Read"'], ...fm };
  return `---\nname: ${f.name}\ndescription: ${f.description}\nmodel: ${f.model}\ncolor: ${f.color}\ntools: [${f.tools.join(", ")}]\n---\nbody\n`;
};

test("frontmatter: every shipped skill passes the strict schema", () => {
  const dirs = skillDirs();
  assert.ok(dirs.length >= 1, "expected at least one skill");
  for (const dir of dirs) {
    const text = readFileSync(join(SKILLS, dir, "SKILL.md"), "utf8");
    const errors = validateFrontmatter("skill", text, dir);
    assert.deepEqual(errors, [], `skills/${dir}/SKILL.md: ${errors.join("; ")}`);
  }
});

test("frontmatter: every shipped agent passes the strict schema", () => {
  const files = agentFiles();
  assert.ok(files.length >= 1, "expected at least one agent");
  for (const f of files) {
    const text = readFileSync(join(AGENTS, f), "utf8");
    const errors = validateFrontmatter("agent", text, f.replace(/\.md$/, ""));
    assert.deepEqual(errors, [], `agents/${f}: ${errors.join("; ")}`);
  }
});

test("frontmatter: a clean agent block validates", () => {
  assert.deepEqual(validateFrontmatter("agent", agentBlock(), "foo"), []);
});

test("frontmatter: unknown keys are rejected", () => {
  const text = `---\nname: foo\ndescription: ${OK_DESC}\nextra: nope\n---\n`;
  assert.ok(validateFrontmatter("skill", text, "foo").some((e) => e.includes("unknown key")));
});

test("frontmatter: a missing required key is rejected", () => {
  const text = `---\nname: foo\n---\n`;
  assert.ok(validateFrontmatter("skill", text, "foo").some((e) => e.includes('missing required key "description"')));
});

test("frontmatter: a non-kebab or mismatched name is rejected", () => {
  const bad = `---\nname: Foo_Bar\ndescription: ${OK_DESC}\n---\n`;
  assert.ok(validateFrontmatter("skill", bad, "Foo_Bar").some((e) => e.includes("kebab-case")));
  const mismatch = `---\nname: foo\ndescription: ${OK_DESC}\n---\n`;
  assert.ok(validateFrontmatter("skill", mismatch, "bar").some((e) => e.includes("must match")));
});

test("frontmatter: a too-short description is rejected", () => {
  const text = `---\nname: foo\ndescription: too short\n---\n`;
  assert.ok(validateFrontmatter("skill", text, "foo").some((e) => e.includes("description too short")));
});

test("frontmatter: agent model / color enums are enforced", () => {
  assert.ok(validateFrontmatter("agent", agentBlock({ model: "gpt" }), "foo").some((e) => e.includes("model")));
  assert.ok(validateFrontmatter("agent", agentBlock({ color: "teal" }), "foo").some((e) => e.includes("color")));
});

test("frontmatter: tools are validated by shape, not an allowlist (tools evolve)", () => {
  // Unknown but well-formed tools are ACCEPTED — new built-ins, plugin tools, MCP tools.
  assert.deepEqual(validateFrontmatter("agent", agentBlock({ tools: ['"mcp__chrome-devtools__click"', '"SomeFutureTool"'] }), "foo"), []);
  // "*" (all tools) is accepted as a list entry.
  assert.deepEqual(validateFrontmatter("agent", agentBlock({ tools: ['"*"'] }), "foo"), []);
  // Only malformed tokens are rejected (whitespace inside a token).
  assert.ok(validateFrontmatter("agent", agentBlock({ tools: ['"bad tool"'] }), "foo").some((e) => e.includes("malformed")));
});

test("frontmatter: a missing or unclosed block is rejected", () => {
  assert.ok(validateFrontmatter("skill", "no frontmatter here\n", "foo").some((e) => e.includes("missing or not closed")));
  assert.ok(validateFrontmatter("skill", `---\nname: foo\n`, "foo").some((e) => e.includes("missing or not closed")));
});

test("frontmatter: optional skill keys are accepted", () => {
  const text = `---\nname: foo\ndescription: ${OK_DESC}\nallowed-tools: Bash(node *)\ncontext: fork\nagent: Explore\nmodel: opus\ndisable-model-invocation: true\n---\n`;
  assert.deepEqual(validateFrontmatter("skill", text, "foo"), []);
});

test("frontmatter: optional skill enums and booleans are validated", () => {
  const ctx = `---\nname: foo\ndescription: ${OK_DESC}\ncontext: inline\n---\n`;
  assert.ok(validateFrontmatter("skill", ctx, "foo").some((e) => e.includes("context")));
  const mdl = `---\nname: foo\ndescription: ${OK_DESC}\nmodel: gpt\n---\n`;
  assert.ok(validateFrontmatter("skill", mdl, "foo").some((e) => e.includes("model")));
  const eff = `---\nname: foo\ndescription: ${OK_DESC}\neffort: ultra\n---\n`;
  assert.ok(validateFrontmatter("skill", eff, "foo").some((e) => e.includes("effort")));
  const flag = `---\nname: foo\ndescription: ${OK_DESC}\ndisable-model-invocation: yep\n---\n`;
  assert.ok(validateFrontmatter("skill", flag, "foo").some((e) => e.includes("disable-model-invocation")));
});

test("frontmatter: skill-only optional keys are rejected for agents", () => {
  // allowed-tools is a skill field; the agent schema (optional: []) must still reject it.
  const text = `---\nname: foo\ndescription: ${OK_DESC}\nmodel: inherit\ncolor: cyan\ntools: ["Read"]\nallowed-tools: Bash(node *)\n---\n`;
  assert.ok(validateFrontmatter("agent", text, "foo").some((e) => e.includes("unknown key")));
});

test("frontmatter: skill when_to_use/agent must be non-empty strings", () => {
  const wt = `---\nname: foo\ndescription: ${OK_DESC}\nwhen_to_use: ["a", "b"]\n---\n`;
  assert.ok(validateFrontmatter("skill", wt, "foo").some((e) => e.includes("when_to_use")));
  const ag = `---\nname: foo\ndescription: ${OK_DESC}\nagent: Explore\n---\n`;
  assert.deepEqual(validateFrontmatter("skill", ag, "foo"), []); // a plain string agent is fine
});
