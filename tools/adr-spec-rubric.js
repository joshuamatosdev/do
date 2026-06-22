"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { parseYaml } = require("./yaml-lite.js");

function loadTemplate(templatePath) {
  return parseYaml(fs.readFileSync(templatePath, "utf8"));
}

const STUB_MIN_CHARS = 40; // a section shorter than this counts as a stub

function splitSections(markdown) {
  const map = new Map();
  const re = /^##\s+(.+)$/gm;
  const heads = [];
  let m;
  while ((m = re.exec(markdown)) !== null) heads.push({ title: m[1].trim(), start: m.index + m[0].length });
  for (let i = 0; i < heads.length; i++) {
    const end = i + 1 < heads.length ? markdown.lastIndexOf("\n##", heads[i + 1].start) : markdown.length;
    const body = markdown.slice(heads[i].start, end < heads[i].start ? markdown.length : end);
    const key = heads[i].title.replace(/^\d+[.)]\s*/, "").trim();
    map.set(key, body);
  }
  return map;
}

// ── Block-level helpers ───────────────────────────────────────────────────────

/**
 * Count bullets under a subhead (### Title or **Title**).
 * Stops at the next ### or ## heading.
 */
function countBullets(body, subheadTitle) {
  if (!subheadTitle) {
    // No subhead — count all top-level bullets
    return (body.match(/^- /gm) || []).length;
  }
  // Find the subhead — either ### Title or **Title**
  const escaped = subheadTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const hRe = new RegExp(`(?:^#{1,6}\\s+${escaped}|^\\*\\*${escaped}\\*\\*)`, "m");
  const hMatch = hRe.exec(body);
  if (!hMatch) return 0;
  // Extract the scope: from after that heading line to the next ### or ## heading
  const after = body.slice(hMatch.index + hMatch[0].length);
  const nextHead = after.search(/^#{1,6}\s/m);
  const scope = nextHead >= 0 ? after.slice(0, nextHead) : after;
  return (scope.match(/^- /gm) || []).length;
}

/**
 * Find a markdown table whose header contains all the given columns.
 * Returns the number of data rows (not counting header and separator), or -1 if not found.
 */
function tableRows(body, columns) {
  // Find all table header lines
  const lines = body.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith("|")) continue;
    // Check if this is a header with all required columns (exact cell match)
    const cells = line.split("|").map((c) => c.trim()).filter((c) => c.length > 0);
    const allPresent = columns.every((col) => cells.includes(col));
    if (!allPresent) continue;
    // Next line must be a separator
    const sep = lines[i + 1] || "";
    if (!sep.startsWith("|") || !/\|[-: ]+\|/.test(sep)) continue;
    // Count data rows in the contiguous table immediately under the matched header
    let count = 0;
    for (let j = i + 2; j < lines.length; j++) {
      if (lines[j].startsWith("|")) count++;
      else break; // stop at blank line or any non-table line
    }
    return count;
  }
  return -1;
}

/**
 * Count blank-line-separated paragraphs of prose in the given body text.
 * Headings, table lines, bullet lines, and fenced code blocks are not prose.
 */
function countParagraphs(body) {
  const lines = body.split("\n");
  let count = 0;
  let inPara = false;
  let inFence = false;
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith("```")) { inFence = !inFence; inPara = false; continue; }
    if (inFence) continue;
    if (t === "" || t.startsWith("#") || t.startsWith("|") || t.startsWith("- ") || t.startsWith("* ") || /^\d+\./.test(t)) {
      inPara = false;
      continue;
    }
    if (!inPara) { count++; inPara = true; }
  }
  return count;
}

/**
 * Returns true if the body contains at least one fenced code block.
 */
function hasFenced(body) {
  return /^```/m.test(body);
}

/**
 * Extract the body of a section scoped to a particular subhead.
 * If no subheadTitle given, returns the full body.
 */
function blockScope(body, subheadTitle) {
  if (!subheadTitle) return body;
  const escaped = subheadTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const hRe = new RegExp(`(?:^#{1,6}\\s+${escaped}|^\\*\\*${escaped}\\*\\*)`, "m");
  const hMatch = hRe.exec(body);
  if (!hMatch) return "";
  const after = body.slice(hMatch.index + hMatch[0].length);
  const nextHead = after.search(/^#{1,6}\s/m);
  return nextHead >= 0 ? after.slice(0, nextHead) : after;
}

// ── Block checker ─────────────────────────────────────────────────────────────

function checkBlock(secBody, block, gaps, sectionTitle, tally) {
  if (block.required === false) return; // conditional block, skip when absent
  tally.total += 1;
  let ok = false;
  if (block.kind === "list") ok = countBullets(secBody, block.title) >= block.items.floor;
  else if (block.kind === "table") ok = tableRows(secBody, block.columns) >= block.rows.floor;
  else if (block.kind === "paragraphs") ok = countParagraphs(blockScope(secBody, block.title)) >= block.paragraphs.floor;
  else if (block.kind === "attributes") ok = tableRows(secBody, ["Status"]) >= 1 || /\bStatus\b/.test(secBody);
  else if (["diagram", "code", "statemachine"].includes(block.kind)) ok = hasFenced(secBody);
  if (ok) tally.covered += 1;
  else gaps.push({ section: sectionTitle, block: block.title || block.kind, reason: "below floor" });
}

// ── Repeating section scorer (Functional Requirements pattern) ────────────────

function scoreRepeating(secBody, repeating, gaps, sectionTitle, tally) {
  const { id_prefix, count, per_item } = repeating;
  // A repeating block with no id_prefix has no token the scorer can key on.
  // Record it as a single gap rather than crashing, so the rest of the spec still scores.
  if (typeof id_prefix !== "string" || id_prefix.length === 0) {
    tally.total += 1;
    gaps.push({ section: sectionTitle, block: "(repeating)", reason: "no id_prefix in template" });
    return;
  }
  // Count how many FR-N / id_prefix instances appear as headings
  const escaped = id_prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const instanceRe = new RegExp(`^#{1,6}\\s+${escaped}\\d+`, "gm");
  const instances = [...secBody.matchAll(instanceRe)];
  const floor = count.floor;

  // Check: enough instances present
  tally.total += 1;
  if (instances.length >= floor) {
    tally.covered += 1;
  } else {
    gaps.push({ section: sectionTitle, block: id_prefix + "count", reason: `below floor (${instances.length}/${floor})` });
  }

  // Check: each required per_item subhead is present in at least floor instances
  for (const itemBlock of per_item) {
    if (itemBlock.required === false) continue;
    tally.total += 1;
    // Count instances that contain this subhead
    let satisfiedCount = 0;
    for (const inst of instances) {
      // Extract that instance's body
      const afterStart = inst.index + inst[0].length;
      const rest = secBody.slice(afterStart);
      const nextInst = rest.search(new RegExp(`^#{1,6}\\s+${escaped}\\d+`, "m"));
      const instBody = nextInst >= 0 ? rest.slice(0, nextInst) : rest;

      let ok = false;
      if (itemBlock.kind === "list") ok = countBullets(instBody, itemBlock.title) >= itemBlock.items.floor;
      else if (itemBlock.kind === "paragraphs") ok = countParagraphs(blockScope(instBody, itemBlock.title)) >= itemBlock.paragraphs.floor;
      else if (itemBlock.kind === "table") ok = tableRows(instBody, itemBlock.columns) >= itemBlock.rows.floor;
      else if (["code", "diagram", "statemachine"].includes(itemBlock.kind)) ok = hasFenced(itemBlock.title ? blockScope(instBody, itemBlock.title) : instBody);
      if (ok) satisfiedCount++;
    }
    // All floor instances must satisfy this per_item block
    if (satisfiedCount >= Math.min(floor, instances.length)) {
      tally.covered += 1;
    } else {
      gaps.push({ section: sectionTitle, block: itemBlock.title || itemBlock.kind, reason: `below floor in instances (${satisfiedCount}/${floor})` });
    }
  }
}

// ── Main scorer ───────────────────────────────────────────────────────────────

function scoreSpec(markdown, tpl) {
  const sections = splitSections(markdown);
  const gaps = [];
  let total = 0, covered = 0;

  for (const sec of tpl.sections) {
    if (sec.required === false && !sections.has(sec.title)) continue; // absent conditional section — skip
    total += 1; // presence check
    const body = sections.get(sec.title);
    if (body == null) {
      gaps.push({ section: sec.title, block: "(section)", reason: "missing" });
      continue;
    }
    if (body.trim().length < STUB_MIN_CHARS) {
      gaps.push({ section: sec.title, block: "(section)", reason: "stub" });
      continue;
    }
    covered += 1;

    const tally = { total, covered };

    // Score blocks
    if (sec.blocks) {
      for (const block of sec.blocks) {
        checkBlock(body, block, gaps, sec.title, tally);
      }
    }

    // Score repeating sections
    if (sec.repeating) {
      scoreRepeating(body, sec.repeating, gaps, sec.title, tally);
    }

    total = tally.total;
    covered = tally.covered;
  }

  const percent = total === 0 ? 100 : Math.round((100 * covered) / total);
  return { total, covered, percent, gaps };
}

module.exports = { loadTemplate, splitSections, scoreSpec, countBullets, tableRows, countParagraphs };

if (require.main === module) {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  const tIdx = args.indexOf("--template");
  const templatePath = tIdx >= 0 ? args[tIdx + 1]
    : path.join(__dirname, "..", "skills", "adr", "templates", "adr-implementation-spec.template.yaml");
  const r = scoreSpec(fs.readFileSync(file, "utf8"), loadTemplate(templatePath));
  if (args.includes("--json")) { console.log(JSON.stringify(r, null, 2)); }
  else {
    console.log(`adr spec completeness: ${r.percent}% (${r.covered}/${r.total})`);
    for (const g of r.gaps) console.log(`  GAP ${g.section} — ${g.block}: ${g.reason}`);
  }
  process.exit(r.percent === 100 ? 0 : 1);
}
