#!/usr/bin/env node
// suggest-do-agents.js — UserPromptSubmit helper. Reads the hook's JSON payload (or raw text) on
// stdin, enumerates the do: agents under agents/*.md (name + one-line purpose, parsed LIVE so a
// newly added agent appears with no edit here), and prints a short suggestion block to stdout for
// injection as turn context. Stays SILENT when the prompt already names a do: agent or asks to
// route/dispatch — the user has already chosen. Pure stdlib; reuses the repo's frontmatter reader.
// Fail-open: any error -> no output, exit 0, never disturb the prompt.
"use strict";

const { readFileSync, readdirSync, existsSync } = require("node:fs");
const { join } = require("node:path");
const { extractBlock } = require("./frontmatter-schema");
const { parseYaml } = require("./yaml-lite");

const AGENTS_DIR = join(__dirname, "..", "agents");
const LINE_CAP = 150;

// First sentence of the description, collapsed to a single readable line and length-capped.
function oneLine(description) {
  const text = String(description || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  const end = text.indexOf(". ");
  let s = end > 0 ? text.slice(0, end + 1) : text;
  if (s.length > LINE_CAP) s = s.slice(0, LINE_CAP - 1).replace(/\s+\S*$/, "") + "…";
  return s;
}

// Scan agents/*.md -> [{ name, summary }], sorted by name. Skips anything unparseable.
function loadAgents() {
  if (!existsSync(AGENTS_DIR)) return [];
  const out = [];
  for (const f of readdirSync(AGENTS_DIR)) {
    if (!f.endsWith(".md")) continue;
    let fm;
    try { fm = parseYaml(extractBlock(readFileSync(join(AGENTS_DIR, f), "utf8")) || ""); }
    catch { continue; }
    if (!fm || typeof fm.name !== "string") continue;
    out.push({ name: fm.name, summary: oneLine(fm.description) });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

// Pull the prompt from the hook's JSON payload, else treat the whole stdin as the prompt.
function readPrompt(stdin) {
  const raw = String(stdin || "");
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj.prompt === "string") return obj.prompt;
  } catch { /* not JSON — the raw text IS the prompt */ }
  return raw;
}

// The user already chose a route (named an agent / invoked a routing skill) -> stay silent.
function namesAnAgent(prompt, names) {
  const p = prompt.toLowerCase();
  if (/\bdo:[a-z][a-z0-9-]*/.test(p)) return true;             // do:<name> — explicit do namespace
  if (/\bdo-(route|team)\b/.test(p)) return true;              // the routing skills
  if (/\bwhich\s+(do\s+|sub)?agent\b/.test(p)) return true;    // "which agent should..."
  for (const n of names) {
    if (p.includes(`${n} agent`)) return true;                 // "<name> agent"
    if (p.includes(`do ${n}`)) return true;                    // "do <name>"
    if (p.includes(`do-${n}`)) return true;                    // "do-<name> this"
  }
  return false;
}

function main() {
  let stdin = "";
  try { stdin = readFileSync(0, "utf8"); } catch { /* no stdin */ }

  const agents = loadAgents();
  if (agents.length === 0) return;                             // nothing to suggest

  const prompt = readPrompt(stdin);
  if (namesAnAgent(prompt, agents.map((a) => a.name))) return; // user already chose — silent

  const lines = agents.map((a) => `- do:${a.name}${a.summary ? ` — ${a.summary}` : ""}`);
  process.stdout.write(
    "DO AGENTS — a specialist may fit this task. If one matches, dispatch it " +
    "(or route via do-route); otherwise proceed normally.\n\n" +
    lines.join("\n") + "\n"
  );
}

try { main(); } catch { /* fail-open: never disturb the prompt */ }
