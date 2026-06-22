// The deterministic compiler: canonical payload -> single-file static HTML.
// This module owns ALL presentation. The report-author never touches it.
// No Date.now(), no Math.random(), no host paths, no locale formatting — every
// variable byte in the output traces to the payload or the pinned CSS/version.
//
// Data-driven by design:
//   - audiences are open strings (payload decides them; no fixed enum)
//   - sections are a registry; meta.sections picks and orders them
//   - customSections lets a payload add ad-hoc sections without engine changes
//   - the theme (CSS) can be overridden via opts.css

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { canonicalize } from "./canonicalize.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CSS = readFileSync(join(HERE, "..", "templates", "styles.css"), "utf8").replace(/\r\n/g, "\n");

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Stable anchor id from a section's semantic path (never positional).
const anchor = (path) => "s-" + createHash("sha256").update(path).digest("hex").slice(0, 10);

const RAG = { upheld: "green", aligned: "green", pass: "green", ok: "green", "backward-compatible": "green",
  "at-risk": "amber", deviates: "amber", partial: "amber", skip: "amber", hold: "red", violated: "red",
  fail: "red", breaking: "red" };
const ragClass = (v) => RAG[v] ?? "unknown";

function evLine(ev) {
  if (!ev) return "";
  const cls = ev === "unverified" ? "ev unverified" : "ev";
  return `<span class="${cls}">${esc(ev)}</span>`;
}

function claims(arr) {
  if (!arr || arr.length === 0) return `<p class="empty">Not provided.</p>`;
  return `<ul class="claims">${arr
    .map((c) => `<li>${esc(c.statement)}${evLine(c.evidence)}</li>`)
    .join("")}</ul>`;
}

function strList(arr) {
  if (!arr || arr.length === 0) return `<p class="empty">Not provided.</p>`;
  return `<ul>${arr.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>`;
}

function table(headers, rows) {
  if (rows.length === 0) return `<p class="empty">Not provided.</p>`;
  return `<table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>` +
    `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

const sevBadge = (s) => `<span class="badge sev-${esc(s)}">${esc(s)}</span>`;
const pill = (v) => `<span class="pill ${ragClass(v)}">${esc(v)}</span>`;

// ---- Section builders. Each returns { title, lens, body }. ----

function secExecutive(p) {
  const v = p.executiveVerdict;
  const kpis = [
    ["Decision", `<span class="decision ${esc(v.decision)}">${esc(v.decision)}</span>`],
    ["Confidence", esc(v.confidence)],
    v.completionPct != null ? ["Completion", `${v.completionPct}%`] : null,
    ["Top risks", String((v.topRisks ?? []).length)],
  ].filter(Boolean);
  return {
    title: "Executive Verdict", lens: "tech-lead",
    body: `<div class="kpis">${kpis.map(([k, val]) => `<div class="kpi"><div class="v">${val}</div><div class="k">${esc(k)}</div></div>`).join("")}</div>` +
      `<p>${esc(v.summary)}</p>` +
      (v.topRisks?.length ? `<h3>Top risks</h3>${strList(v.topRisks)}` : ""),
  };
}

function secScope(p) {
  const s = p.scopeInputs;
  return {
    title: "Scope & Inputs", lens: "all",
    body: `<div class="meta-grid">` +
      (s.timeframe ? `<div><span>Timeframe:</span> ${esc(s.timeframe)}</div>` : "") +
      (s.filesTouched != null ? `<div><span>Files touched:</span> ${s.filesTouched}</div>` : "") +
      (s.repos?.length ? `<div><span>Repos:</span> ${s.repos.map(esc).join(", ")}</div>` : "") +
      `</div>` +
      (s.commits?.length ? `<h3>Commits</h3>${strList(s.commits)}` : "") +
      `<h3>Evidence sources</h3>${strList(s.evidenceSources)}`,
  };
}

function secChangeInventory(p) {
  const rows = p.changeInventory.entries.map((e) => [
    `<code>${esc(e.path)}</code>`, esc(e.changeType), esc(e.module ?? "—"),
    esc(e.concern), e.loc != null ? String(e.loc) : "—", e.riskTag ? sevBadge(e.riskTag) : "—",
  ]);
  return {
    title: "Change Inventory", lens: "all",
    body: table(["Path", "Change", "Module", "Concern", "LOC", "Risk"], rows),
  };
}

function secArchitecture(p) {
  const a = p.architectureImpact ?? {};
  const inv = (a.invariants ?? []).map((i) => [esc(i.statement), pill(i.status), evLine(i.evidence) || "—"]);
  const adr = (a.adrAlignment ?? []).map((x) => [esc(x.adr), pill(x.status), esc(x.note ?? "—")]);
  return {
    title: "Architecture Impact", lens: "distinguished-engineer",
    body: (a.boundaries?.length ? `<h3>Boundaries touched</h3>${strList(a.boundaries)}` : "") +
      `<h3>Invariants</h3>${table(["Invariant", "Status", "Evidence"], inv)}` +
      `<h3>ADR / canon alignment</h3>${table(["ADR", "Status", "Note"], adr)}` +
      `<h3>Rejected alternatives</h3>${claims(a.rejectedAlternatives)}`,
  };
}

function secSystem(p) {
  const s = p.systemImpact ?? {};
  return {
    title: "System Impact", lens: "system-engineer",
    body: (s.topology ? `<h3>Topology</h3><p>${esc(s.topology)}</p>` : "") +
      `<h3>Dependencies</h3>${strList(s.dependencies)}` +
      `<h3>Deploy order</h3>${strList(s.deployOrder)}` +
      `<h3>Data flows</h3>${strList(s.dataFlows)}` +
      `<h3>Operational concerns</h3>${claims(s.operationalConcerns)}`,
  };
}

function secRisk(p) {
  const rows = p.riskRegister.risks.map((r) => [
    `<code>${esc(r.id)}</code>`, esc(r.description), sevBadge(r.severity),
    esc(r.likelihood), esc(r.owner ?? "—"), esc(r.mitigation ?? "—"), esc(r.residual ?? "—"),
  ]);
  return {
    title: "Risk Register", lens: "tech-lead",
    body: table(["ID", "Description", "Severity", "Likelihood", "Owner", "Mitigation", "Residual"], rows),
  };
}

function secVerification(p) {
  const v = p.verificationEvidence;
  const rows = v.tests.map((t) => [esc(t.tier), esc(t.name), pill(t.result), esc(t.detail ?? "—"), evLine(t.evidence) || "—"]);
  const kpis = [
    ["Tests", String(v.tests.length)],
    ["Passing", String(v.tests.filter((t) => t.result === "pass").length)],
    ["Failing", String(v.tests.filter((t) => t.result === "fail").length)],
    v.coveragePct != null ? ["Coverage", `${v.coveragePct}%`] : null,
  ].filter(Boolean);
  return {
    title: "Verification Evidence", lens: "all",
    body: `<div class="kpis">${kpis.map(([k, val]) => `<div class="kpi"><div class="v">${val}</div><div class="k">${esc(k)}</div></div>`).join("")}</div>` +
      `<h3>Test results</h3>${table(["Tier", "Name", "Result", "Detail", "Evidence"], rows)}` +
      (v.lint || v.typecheck || v.ci ? `<div class="meta-grid">` +
        (v.lint ? `<div><span>Lint:</span> ${esc(v.lint)}</div>` : "") +
        (v.typecheck ? `<div><span>Typecheck:</span> ${esc(v.typecheck)}</div>` : "") +
        (v.ci ? `<div><span>CI:</span> ${esc(v.ci)}</div>` : "") + `</div>` : "") +
      (v.skipped?.length ? `<h3>Skipped checks</h3>${table(["Check", "Reason"], v.skipped.map((s) => [esc(s.check), esc(s.reason)]))}` : ""),
  };
}

function secContracts(p) {
  const c = p.contractDiffs;
  if (!c) return { title: "API / Data / Contract Diffs", lens: "distinguished-engineer", body: `<p class="empty">Not provided — no contract surface changed.</p>` };
  return {
    title: "API / Data / Contract Diffs", lens: "distinguished-engineer",
    body: (c.compatibility ? `<p>Compatibility: ${pill(c.compatibility)} ${c.notes ? esc(c.notes) : ""}</p>` : "") +
      `<h3>Endpoints</h3>${strList(c.endpoints)}` +
      `<h3>Events</h3>${strList(c.events)}` +
      `<h3>Schemas</h3>${strList(c.schemas)}`,
  };
}

function secRollout(p) {
  const r = p.rolloutRollback ?? {};
  return {
    title: "Rollout & Rollback", lens: "system-engineer",
    body: `<h3>Feature flags</h3>${strList(r.flags)}` +
      `<h3>Migrations</h3>${strList(r.migrations)}` +
      `<h3>Observability</h3>${strList(r.observability)}` +
      `<h3>Backout criteria</h3>${strList(r.backoutCriteria)}`,
  };
}

// Audience notes are data-driven: the payload supplies a list of
// { audience, notes[] }. Any audience name works — no fixed enum.
function secAudience(p) {
  const notes = p.audienceNotes ?? [];
  if (notes.length === 0) return { title: "Audience Notes", lens: "all", body: `<p class="empty">Not provided.</p>` };
  return {
    title: "Audience Notes", lens: "all",
    body: notes.map((n) => `<h3>${esc(n.audience)} lens</h3>${claims(n.notes)}`).join(""),
  };
}

function secDecisions(p) {
  const rows = p.openDecisions.items.map((d) => [
    esc(d.question), d.blocking ? `<span class="pill red">blocking</span>` : `<span class="pill unknown">non-blocking</span>`,
    esc(d.owner ?? "—"), esc(d.recommendation ?? "—"),
  ]);
  return {
    title: "Open Decisions & Blockers", lens: "tech-lead",
    body: table(["Question", "Blocking", "Owner", "Recommendation"], rows),
  };
}

function secAppendix(p, hashes) {
  const a = p.appendix ?? {};
  const cmds = (a.commands ?? []).map((c) => [`<code>${esc(c.cmd)}</code>`, pill(c.outcome), evLine(c.evidence) || "—"]);
  const diagrams = (a.diagramSources ?? [])
    .map((d) => `<div class="diagram-title">${esc(d.title)}</div><pre class="mermaid-src">${esc(d.mermaid)}</pre>`)
    .join("") || `<p class="empty">No diagrams provided.</p>`;
  return {
    title: "Appendix", lens: "all",
    body: `<h3>Command evidence matrix</h3>${table(["Command", "Outcome", "Evidence"], cmds)}` +
      `<h3>Diagram sources (Mermaid)</h3>${diagrams}` +
      `<h3>File references</h3>${strList(a.fileRefs)}` +
      `<h3>Integrity hashes</h3><div class="meta-grid"><div><span>Payload SHA-256:</span> <code>${hashes.payloadSha}</code></div></div>`,
  };
}

// A custom section: { title, lens?, items: [claim] | [string] }.
function secCustom(c) {
  const items = c.items ?? [];
  const isClaims = items.length > 0 && typeof items[0] === "object";
  return {
    title: c.title, lens: c.lens ?? "all",
    body: isClaims ? claims(items) : strList(items),
  };
}

// The registry of preset sections, keyed by id. The default order is the
// full delivery-report preset; meta.sections may pick and reorder a subset.
const SECTIONS = {
  executiveVerdict: secExecutive,
  scopeInputs: secScope,
  changeInventory: secChangeInventory,
  architectureImpact: secArchitecture,
  systemImpact: secSystem,
  riskRegister: secRisk,
  verificationEvidence: secVerification,
  contractDiffs: secContracts,
  rolloutRollback: secRollout,
  audienceNotes: secAudience,
  openDecisions: secDecisions,
  appendix: (p, h) => secAppendix(p, h),
};
const DEFAULT_ORDER = [
  "executiveVerdict", "scopeInputs", "changeInventory", "architectureImpact", "systemImpact",
  "riskRegister", "verificationEvidence", "contractDiffs", "rolloutRollback", "audienceNotes",
  "openDecisions", "appendix",
];

/**
 * Render a report payload to a deterministic single-file HTML string.
 * @param {object} rawPayload payload conforming to report.schema.json
 * @param {object} opts { engineVersion, css } — css overrides the default theme
 */
export function render(rawPayload, opts = {}) {
  const p = canonicalize(rawPayload);
  const engineVersion = opts.engineVersion ?? "0.0.0";
  const css = (opts.css ?? DEFAULT_CSS).replace(/\r\n/g, "\n");
  const payloadSha = createHash("sha256")
    .update(JSON.stringify(p) /* canonical: keys sorted by canonicalize */)
    .digest("hex");

  // Section order: payload's meta.sections (validated subset) or the full preset.
  // appendix is always rendered last; customSections come just before it.
  const requested = (p.meta.sections ?? DEFAULT_ORDER).filter((id) => id in SECTIONS);
  const hasAppendix = requested.includes("appendix");
  const ordered = requested.filter((id) => id !== "appendix");

  // A section's lens (which audience it serves) defaults to the preset label but
  // is data-driven: meta.lenses maps a section id to a label of your choice.
  const lenses = p.meta.lenses ?? {};
  const lensFor = (id, def) => lenses[id] ?? def;
  const built = ordered.map((id) => { const s = SECTIONS[id](p, { payloadSha }); s.lens = lensFor(id, s.lens); return s; });
  for (const c of p.customSections ?? []) built.push(secCustom(c));
  if (hasAppendix) { const s = SECTIONS.appendix(p, { payloadSha }); s.lens = lensFor("appendix", s.lens); built.push(s); }

  const sections = built.map((s, i) => ({ ...s, num: i + 1, id: anchor(`${i}:${s.title}`) }));

  const m = p.meta;
  const reportKind = m.reportKind ?? "Engineering Delivery Report";
  const audienceTags = (m.audiences ?? []).map((a) => `<span class="pill unknown">${esc(a)}</span>`).join(" ");

  const toc = sections
    .map((s) => `<a href="#${s.id}">${String(s.num).padStart(2, "0")}. ${esc(s.title)}</a>`)
    .join("");

  const body = sections
    .map((s) => `<section class="card" id="${s.id}"><h2><span class="n">${String(s.num).padStart(2, "0")}</span>${esc(s.title)}<span class="lens">${esc(s.lens)}</span></h2>${s.body}</section>`)
    .join("\n");

  const metaGrid = [
    ["Report", m.reportId], ["Subject", `${m.subjectType}: ${m.subject}`],
    ["Generated", m.generatedAt], ["Author", m.authorAgent],
    m.gitRange ? ["Git range", m.gitRange] : null,
    m.repos?.length ? ["Repos", m.repos.join(", ")] : null,
  ].filter(Boolean)
    .map(([k, v]) => `<div><span>${esc(k)}:</span> ${esc(v)}</div>`).join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="do-report-engine@${esc(engineVersion)}">
<title>${esc(m.title)}</title>
<style>
${css}</style>
</head>
<body>
<div class="wrap">
<header class="masthead">
<h1>${esc(m.title)}</h1>
<div class="sub">${esc(reportKind)}</div>
<div class="meta-grid">${metaGrid}</div>
<div class="audience-tags">${audienceTags}</div>
</header>
<nav class="toc">${toc}</nav>
${body}
<footer class="engine">Rendered by the DO report engine v${esc(engineVersion)} · payload sha256:${payloadSha} · deterministic build (no wall-clock, no RNG)</footer>
</div>
</body>
</html>
`;
}
