#!/usr/bin/env node
// write-local-findings.js — local (offline) findings sink for the agent-team module.
// Renders a neutral findings.json into a service-free Markdown issue tracker:
//   <dir>/ISSUE-<id>.md (one per finding) + <dir>/index.md (table).
// Idempotent by finding id; preserves user-owned `status` and original `created`
// on re-run. No network, no external dependencies.
const fs = require("node:fs");
const path = require("node:path");

const TEMPLATES = path.join(__dirname, "..", "assets");

// Sanitizers: keep a backtick out of a Markdown code span, and a pipe/newline out of a table cell.
const stripTicks = (s) => String(s == null ? "" : s).replace(/[`]/g, "");
const escCell = (s) => String(s == null ? "" : s).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

function parseArgs(argv) {
  const args = { dir: "issues", dryRun: false, findings: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--findings") args.findings = argv[++i];
    else if (a === "--dir") args.dir = argv[++i];
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "-h" || a === "--help") args.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function fill(tpl, vars) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => (k in vars ? String(vars[k]) : ""));
}

function renderEvidence(ev) {
  if (!Array.isArray(ev) || ev.length === 0) return "_None_";
  return ev.map((e) => {
    const loc = e.file ? ` (\`${stripTicks(e.file)}${e.line != null ? ":" + e.line : ""}\`)` : "";
    return `- [${e.type || "note"}] ${e.value || ""}${loc}`;
  }).join("\n");
}

function renderList(items, bullet) {
  if (!Array.isArray(items) || items.length === 0) return "_None_";
  return items.map((i) => `${bullet} ${i}`).join("\n");
}

function readExistingMeta(file) {
  if (!fs.existsSync(file)) return null;
  const txt = fs.readFileSync(file, "utf8");
  const status = (txt.match(/^status:\s*(.+)$/m) || [])[1];
  const created = (txt.match(/^created:\s*(.+)$/m) || [])[1];
  return { status: status && status.trim(), created: created && created.trim() };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Usage: node write-local-findings.js --findings <file> [--dir issues] [--dry-run]");
    return;
  }
  if (!args.findings) throw new Error("--findings <file> is required");

  const doc = JSON.parse(fs.readFileSync(args.findings, "utf8"));
  if (!doc || !Array.isArray(doc.findings)) {
    throw new Error("findings file must be an object with a findings array");
  }

  const issueTpl = fs.readFileSync(path.join(TEMPLATES, "issue.template.md"), "utf8");
  const indexTpl = fs.readFileSync(path.join(TEMPLATES, "index.template.md"), "utf8");
  const today = new Date().toISOString().slice(0, 10);

  const planned = [];
  const rows = [];

  for (const f of doc.findings) {
    if (!f.id) { console.warn("skip: finding without id"); continue; }
    if (!/^[A-Za-z0-9._-]+$/.test(f.id) || f.id.includes("..") || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(f.id)) {
      throw new Error(`Unsafe finding id rejected (need ^[A-Za-z0-9._-]+$, no ".." or Windows device name): ${f.id}`);
    }
    const file = path.join(args.dir, `ISSUE-${f.id}.md`);
    const prev = readExistingMeta(file);
    const status = (prev !== null && prev.status !== undefined) ? prev.status : "open";
    const created = (prev !== null && prev.created !== undefined) ? prev.created : today;
    const body = fill(issueTpl, {
      id: f.id, title: f.title || "", severity: f.severity || "", status, team: f.team || "",
      category: f.category || "", created,
      summary: f.summary || "", impact: f.impact || "", remediation: f.remediation || "",
      evidence: renderEvidence(f.evidence),
      verification: renderList(f.verification, "- [ ]"),
      references: renderList(f.references, "-"),
    });
    planned.push({ file, body });
    rows.push(`| ${escCell(f.id)} | ${escCell(f.title)} | ${escCell(f.severity)} | ${escCell(status)} | ${escCell(f.category)} |`);
  }

  const index = fill(indexTpl, { rows: rows.join("\n") });

  if (args.dryRun) {
    console.log(`DRY-RUN: would write ${planned.length} issue file(s) + index.md to ${args.dir}/`);
    planned.forEach((p) => console.log(`  ${p.file}`));
    return;
  }

  fs.mkdirSync(args.dir, { recursive: true });
  planned.forEach((p) => fs.writeFileSync(p.file, p.body));
  fs.writeFileSync(path.join(args.dir, "index.md"), index);
  console.log(`Wrote ${planned.length} issue file(s) + index.md to ${args.dir}/`);
}

main();
