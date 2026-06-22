// frontmatter-schema.js — strict checking of the leading --- frontmatter block
// in skill and agent markdown files. Zero deps; standard library only. Built on
// tools/yaml-lite.js, the same restricted-YAML reader the adr spec template uses.
//
// Two kinds:
//   skill — skills/<name>/SKILL.md : required { name, description } + optional
//           invocation / tool / routing fields (allowed-tools, disallowed-tools,
//           disable-model-invocation, user-invocable, argument-hint, when_to_use,
//           context, agent, model, effort)
//   agent — agents/<name>.md       : { name, description, model, color, tools }
//
// A file is valid when: the block opens and closes with ---, every required key
// is present and well-typed, no unknown key appears, name is kebab-case and
// matches the file's own name, the description is long enough to be picked up,
// any optional key present is well-typed, and (agents) model / color are allowed
// values and tools are well-formed tokens.
//
// Tools are validated by SHAPE, not by an allowlist: tools evolve (new built-ins,
// plugin tools, MCP tools like `mcp__server__tool`), so the schema must never block
// an agent from granting a real tool we have not enumerated. Models, colors, and
// effort levels stay closed enums — small, stable, deliberately-curated sets.

"use strict";

const { parseYaml } = require("./yaml-lite");

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MIN_DESCRIPTION = 40;

// Closed enums — kept small on purpose; widen the list here, never at a call site.
// Models, colors, and effort are stable, so a new value is a conscious edit (a strict gate).
const MODELS = ["inherit", "opus", "sonnet", "haiku", "fable"];
const COLORS = ["red", "orange", "yellow", "green", "cyan", "blue", "purple", "pink"];
const EFFORTS = ["low", "medium", "high", "xhigh", "max"];

// Core tool tokens we ship/know — REFERENCE ONLY, not a closed gate. Tools are validated
// by shape (TOOL_TOKEN) below, never by membership here, so an unknown-but-well-formed tool
// (a new built-in, a plugin tool, an MCP tool) is never rejected. Add to this list freely for
// documentation; it changes nothing about what validates.
const KNOWN_TOOLS = [
  "Read", "Write", "Edit", "Grep", "Glob", "Bash",
  "Agent", "Task", "TodoWrite", "WebFetch", "WebSearch", "NotebookEdit",
  "Skill", "ToolSearch", "NotebookRead", "TodoRead",
];

// A valid tool entry: "*" (all tools), a built-in / plugin name (Read, WebSearch, ...), or an
// MCP tool token (mcp__server__tool — underscores, hyphens, dots allowed). Shape, not membership.
const TOOL_TOKEN = /^(?:\*|[A-Za-z][\w.-]*)$/;

const SCHEMAS = {
  // Optional SKILL.md keys are the documented invocation / tool / routing controls.
  // They are PERMITTED (so skills can use real abilities) and shape-checked below;
  // `allowed-tools` / `disallowed-tools` hold permission patterns (e.g. `Bash(node *)`),
  // not bare tool tokens, so they are validated only as non-empty string-or-list.
  skill: {
    required: ["name", "description"],
    optional: [
      "allowed-tools", "disallowed-tools", "disable-model-invocation",
      "user-invocable", "argument-hint", "when_to_use", "context", "agent",
      "model", "effort",
    ],
  },
  agent: { required: ["name", "description", "model", "color", "tools"], optional: [] },
};

// Pull the text inside the first --- ... --- block. Returns null if the block is
// missing or never closed.
function extractBlock(text) {
  if (!/^---\r?\n/.test(text)) return null;
  const lines = text.split(/\r?\n/);
  const body = [];
  let closed = false;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") { closed = true; break; }
    body.push(lines[i]);
  }
  return closed ? body.join("\n") : null;
}

// Check one frontmatter object for `kind`. `expectedName` is the dir
// (skills) or file basename (agents) the name must equal. Returns an array of
// error strings — empty means valid.
function validateFields(kind, fm, expectedName) {
  const schema = SCHEMAS[kind];
  const errors = [];
  if (!schema) { errors.push(`unknown kind "${kind}"`); return errors; }

  const allKeys = [...schema.required, ...(schema.optional || [])];
  const allowed = new Set(allKeys);
  for (const key of Object.keys(fm)) {
    if (!allowed.has(key)) errors.push(`unknown key "${key}" (allowed: ${allKeys.join(", ")})`);
  }
  for (const key of schema.required) {
    if (fm[key] === undefined || fm[key] === null) errors.push(`missing required key "${key}"`);
  }

  if (typeof fm.name === "string") {
    if (!KEBAB.test(fm.name)) errors.push(`name "${fm.name}" must be kebab-case`);
    if (expectedName !== undefined && fm.name !== expectedName)
      errors.push(`name "${fm.name}" must match "${expectedName}"`);
  } else if (fm.name !== undefined) {
    errors.push("name must be a string");
  }

  if (typeof fm.description === "string") {
    const len = fm.description.trim().length;
    if (len < MIN_DESCRIPTION) errors.push(`description too short (${len} chars; need >= ${MIN_DESCRIPTION})`);
  } else if (fm.description !== undefined) {
    errors.push("description must be a string");
  }

  if (kind === "skill") {
    // Boolean invocation flags.
    for (const flag of ["disable-model-invocation", "user-invocable"]) {
      if (fm[flag] !== undefined && typeof fm[flag] !== "boolean")
        errors.push(`${flag} must be true or false`);
    }
    // Permission-pattern lists: non-empty string (space/comma-separated) or list of strings.
    for (const tl of ["allowed-tools", "disallowed-tools"]) {
      const v = fm[tl];
      if (v === undefined) continue;
      const okStr = typeof v === "string" && v.trim() !== "";
      const okArr = Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "string" && x.trim() !== "");
      if (!okStr && !okArr) errors.push(`${tl} must be a non-empty string or list of tool patterns`);
    }
    // Closed enums.
    if (fm.context !== undefined && fm.context !== "fork")
      errors.push(`context "${fm.context}" not in {fork}`);
    if (fm.model !== undefined && !MODELS.includes(fm.model))
      errors.push(`model "${fm.model}" not in {${MODELS.join(", ")}}`);
    if (fm.effort !== undefined && !EFFORTS.includes(fm.effort))
      errors.push(`effort "${fm.effort}" not in {${EFFORTS.join(", ")}}`);
    // argument-hint may be a string OR a YAML list (e.g. [issue-number]) — leave it free-form.
    for (const s of ["when_to_use", "agent"]) {
      if (fm[s] !== undefined && (typeof fm[s] !== "string" || fm[s].trim() === ""))
        errors.push(`${s} must be a non-empty string`);
    }
  }

  if (kind === "agent") {
    if (fm.model !== undefined && !MODELS.includes(fm.model))
      errors.push(`model "${fm.model}" not in {${MODELS.join(", ")}}`);
    if (fm.color !== undefined && !COLORS.includes(fm.color))
      errors.push(`color "${fm.color}" not in {${COLORS.join(", ")}}`);
    if (fm.tools !== undefined) {
      // "*" grants all tools. Otherwise a non-empty list of well-formed tokens. Validated by
      // shape, never by membership — unknown-but-well-formed tools (MCP / plugin / future
      // built-ins) pass, so the gate never blocks an agent from using a tool we don't know about.
      if (fm.tools === "*") {
        // all tools — fine
      } else if (!Array.isArray(fm.tools)) {
        errors.push('tools must be a list or "*"');
      } else if (fm.tools.length === 0) {
        errors.push("tools must not be empty");
      } else {
        for (const t of fm.tools)
          if (typeof t !== "string" || !TOOL_TOKEN.test(t))
            errors.push(`tool ${JSON.stringify(t)} is malformed (use a tool name, an mcp__ tool, or "*")`);
      }
    }
  }

  return errors;
}

// Check a whole file's text. Returns an array of error strings (empty = valid).
function validateFrontmatter(kind, text, expectedName) {
  const block = extractBlock(text);
  if (block === null) return ["frontmatter block missing or not closed with ---"];
  let fm;
  try { fm = parseYaml(block); }
  catch (e) { return [`frontmatter did not parse: ${e.message}`]; }
  if (!fm || typeof fm !== "object" || Array.isArray(fm)) return ["frontmatter is not a key/value block"];
  return validateFields(kind, fm, expectedName);
}

module.exports = {
  validateFrontmatter, validateFields, extractBlock,
  MODELS, COLORS, EFFORTS, KNOWN_TOOLS, TOOL_TOKEN, MIN_DESCRIPTION,
  TOOLS: KNOWN_TOOLS, // back-compat alias (reference list; no longer a gate)
};
