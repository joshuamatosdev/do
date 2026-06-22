const { test } = require("node:test");
const assert = require("node:assert");
const { readFileSync, readdirSync, existsSync } = require("node:fs");
const { join } = require("node:path");
const { extractBlock } = require("../tools/frontmatter-schema");
const { parseYaml } = require("../tools/yaml-lite");

const AGENTS = join(__dirname, "..", "agents");
const agentFiles = () => (existsSync(AGENTS) ? readdirSync(AGENTS).filter((f) => f.endsWith(".md")) : []);

// The capability gate (do/spine/capability-gate.md) is loaded for the host loop, but shipped
// subagents run on their own system prompt — so each must grant the knowledge-route web tools AND
// carry the "reach before you refuse" directive in its body. See agents/*.md.
test("security-recon logs to OS temp, not the repository tree", () => {
  // Regression: the engagement log must not be written into the repo working tree.
  const md = readFileSync(join(AGENTS, "security-recon.md"), "utf8");
  assert.ok(!md.includes("./security-recon-log.md"), "must not write the engagement log to the repo tree");
  assert.match(md, /OS temp|TMPDIR|os\.tmpdir|%TEMP%/, "routes the engagement log to OS temp");
});

test("every shipped agent grants the knowledge-route web tools", () => {
  const files = agentFiles();
  assert.ok(files.length >= 1, "expected at least one agent");
  for (const f of files) {
    const fm = parseYaml(extractBlock(readFileSync(join(AGENTS, f), "utf8")));
    assert.ok(Array.isArray(fm.tools), `agents/${f}: tools is a list`);
    assert.ok(fm.tools.includes("WebSearch"), `agents/${f}: grants WebSearch (knowledge route)`);
    assert.ok(fm.tools.includes("WebFetch"), `agents/${f}: grants WebFetch (knowledge route)`);
    assert.ok(fm.tools.includes("Bash"), `agents/${f}: keeps Bash (verification route)`);
  }
});

test("every shipped agent carries the capability-check directive", () => {
  for (const f of agentFiles()) {
    const text = readFileSync(join(AGENTS, f), "utf8");
    assert.match(text, /## Capability check — reach before you refuse/, `agents/${f}: has the capability directive`);
    assert.match(text, /Before reporting "I can't", "I don't know", or "blocked"/, `agents/${f}: has the refuse-reflex line`);
  }
});
