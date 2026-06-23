"use strict";
// capability-preservation.js — DO-CAP-001 deterministic scanner (DARK: not wired to any hook).
//
// Prevents the "silent capability-drop disguised as a finished fix" failure mode: a turn that
// replaces a value-producing path with a constant sentinel (UNKNOWN / N/A / a soft stand-in)
// because the source projection/query/schema/read-model is MISSING, then narrates the change as
// complete. Design: do:mon consult DO-CAP-001 (ChatGPT Pro, 2026-06-22) + grounded staging.
//
// SCOPE OF THIS FILE (be honest — this is v1 core, not the whole gate):
//   * IN:  parse a unified diff, score "capability-drop" candidates on added lines, parse the
//          turn's surfaced-gap records, and return an allow/block verdict.
//   * OUT (later increments, by design): the live Stop hook wiring, the UserPromptSubmit baseline
//          snapshot from a real git tree, tracker grounding against the repo, the codex-integrity
//          packet hand-off, and the DEFER-facet continuation rule. Those are separate surfaces.
//
// Pure + dependency-free + side-effect-free so it is unit-testable without git. The eventual hook
// feeds `git diff` text + the turn text in; this module only decides.
//
// Distinction it enforces (NOT a ban on UNKNOWN):
//   instance absence — this record genuinely has no value; the contract allows it       -> ALLOW
//   system  absence — the value is never computed because an implementation is missing   -> BLOCK
//                      unless the turn says CAPABILITY STATUS: NOT COMPLETE + a grounded record.

// --- signal patterns ---------------------------------------------------------------------------
// A hard sentinel is an explicit "no value" token. N/A is matched as a literal (it carries a slash).
const HARD_SENTINEL =
  /\b(?:UNKNOWN|UNAVAILABLE|NOT[_ -]?AVAILABLE|UNSPECIFIED|UNSUPPORTED|TBD)\b|N\/A|Optional\.empty\(\)/i;

// A soft stand-in (null / 0 / "" / '') is only a candidate WITH system-gap + value-sink + a
// user-facing path — on its own it is ordinary code (a counter, a default), never flagged.
const SOFT_STANDIN =
  /\breturn\s+(?:null|0(?:\.0+)?|""|'')\b|[:=]\s*(?:null|0(?:\.0+)?|""|'')(?=[\s,;)\]]|$)/i;

// Evidence that the absence is SYSTEM (a missing source), not a legitimate empty record.
const SYSTEM_GAP = new RegExp(
  [
    "\\b(?:no|missing|without)\\b[\\w\\s-]{0,30}?\\b(?:metric|measure|data|source|projection|column|field|signal|read[- ]?model)\\b",
    "\\b(?:projection|query|schema|source|read[- ]?model)\\b[\\w\\s-]{0,20}?\\b(?:has|contains|provides)\\s+no\\b",
    "\\blacks?\\b[\\w\\s-]{0,30}?\\b(?:metric|measure|data|source|projection|column|field|read[- ]?model)\\b",
    "\\b(?:cannot|can't|unable to)\\s+(?:compute|derive|populate)\\b",
    "\\b(?:placeholder|sentinel|fallback|for now)\\b",
    "\\buntil\\b[\\w\\s-]{0,30}?\\bexists?\\b",
  ].join("|"),
  "i",
);

// A value-producing position: a return, an assignment, a builder/setter call, or a SQL projection.
const VALUE_SINK = /\breturn\b|[:=]\s*\S|\.(?:put|set|add|with|builder)\s*\(|\.\w+\s*\(|\b(?:select|case|coalesce|as)\b/i;

// A path/line that surfaces a value to consumers (where a drop becomes a product regression).
const USER_FACING =
  /\b(?:controller|service|mapper|projection|query|repository|serializer|presenter|view|dto|response|api|endpoint|handler)\b/i;

// A genuine per-record / per-input absence branch (an instance absence, which is allowed).
const INSTANCE_ABSENCE =
  /\b(?:input|row|record|payload|upstream)\b[\s\S]{0,40}?\b(?:null|missing|absent|omitted|empty)\b|\bif\s*\([^)]*(?:==\s*null|!=\s*null|isEmpty|!?isPresent|isBlank)/i;

// Paths whose sentinels are not product behavior — excluded outright (a test/doc/fixture UNKNOWN is
// not a regression). Deliberately a HARD skip, not a score penalty: a high-confidence hard sentinel
// would otherwise still cross the threshold after a fixed penalty.
const EXCLUDE_PATH =
  /(?:^|\/)(?:tests?|__tests__|spec|fixtures?|mocks?|__mocks__|snapshots?|generated|gen|vendor|node_modules|build|dist|target|docs?)\//i;
const EXCLUDE_FILE = /(?:Test|Spec|IT)\.\w+$|\.(?:test|spec)\.\w+$|\.(?:md|markdown|txt|adoc|rst)$/i;

const SCORE_THRESHOLD = 8;
const STATUS_SCAN_LINES = 20; // CAPABILITY STATUS must appear within the first N non-blank lines.

function isComment(line) {
  return /^\s*(?:\/\/|#|\*|--|\/\*|<!--)/.test(line);
}

function classifyPath(path) {
  const p = String(path || "");
  return { excluded: EXCLUDE_PATH.test(p) || EXCLUDE_FILE.test(p), userFacing: USER_FACING.test(p) };
}

// Stable, line-number-independent id from path + symbol + normalized line (djb2 -> 4 hex chars).
function hashId(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i += 1) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return `CAP-${h.toString(16).padStart(8, "0").slice(0, 4)}`;
}

function normalizeLine(line) {
  return line.replace(/^[+]/, "").trim().replace(/\s+/g, " ");
}

function extractSymbol(line) {
  const m =
    line.match(/\.([A-Za-z_]\w*)\s*\(/) || // .employerDiversity(
    line.match(/\bAS\s+([A-Za-z_]\w*)/i) || // AS employer_diversity
    line.match(/([A-Za-z_]\w*)\s*[:=]/) || // employerDiversity =
    line.match(/\/\/\s*([A-Za-z_]\w*)/); // // employerDiversity
  return m ? m[1] : "value";
}

// Parse a unified diff into per-hunk added lines, grouped by file. Returns [{file, added:[raw...]}].
function parseHunks(diffText) {
  const hunks = [];
  let file = "";
  let added = null;
  const flush = () => {
    if (added && added.length) hunks.push({ file, added });
    added = null;
  };
  for (const raw of String(diffText || "").split(/\r?\n/)) {
    if (raw.startsWith("+++ ")) {
      flush();
      file = raw.slice(4).replace(/^b\//, "").replace(/\t.*$/, "").trim();
      continue;
    }
    if (raw.startsWith("diff --git")) {
      flush();
      const m = raw.match(/ b\/(\S+)/);
      if (m) file = m[1];
      continue;
    }
    if (raw.startsWith("@@")) {
      flush();
      added = [];
      continue;
    }
    if (raw.startsWith("+") && !raw.startsWith("+++")) {
      if (!added) added = [];
      added.push(raw.slice(1));
    }
  }
  flush();
  return hunks;
}

// Score one added executable line within its hunk. Returns a candidate or null.
function scoreCandidate({ file, line, hunkText, userFacingPath }) {
  const hard = HARD_SENTINEL.test(line);
  const soft = !hard && SOFT_STANDIN.test(line);
  if (!hard && !soft) return null;

  const systemGap = SYSTEM_GAP.test(hunkText);
  const valueSink = VALUE_SINK.test(line);
  const userFacing = userFacingPath || USER_FACING.test(line) || USER_FACING.test(hunkText);

  // A soft stand-in is ordinary code unless ALL three corroborating signals are present.
  if (soft && !(systemGap && valueSink && userFacing)) return null;

  const instanceAbsence = INSTANCE_ABSENCE.test(hunkText);
  const reasons = [];
  let score = 0;
  if (hard) { score += 4; reasons.push("hard-sentinel+4"); }
  if (systemGap) { score += 3; reasons.push("system-gap+3"); }
  if (valueSink) { score += 2; reasons.push("value-sink+2"); }
  if (userFacing) { score += 2; reasons.push("user-facing+2"); }
  if (!instanceAbsence) { score += 2; reasons.push("unconditional+2"); }
  else { score -= 4; reasons.push("instance-absence-4"); }

  if (score < SCORE_THRESHOLD) return null;

  const normalized = normalizeLine(line);
  const symbol = extractSymbol(line);
  const fingerprint = `${file}|${symbol}|${normalized}`;
  return { id: hashId(fingerprint), file, symbol, line: normalized, score, reasons, fingerprint };
}

// Scan a unified diff; return capability-drop candidates introduced by the diff, minus a baseline
// (an array of fingerprint strings of candidates that pre-existed this turn).
function scanDiff(diffText, { baseline = [] } = {}) {
  const seen = new Set(baseline);
  const out = [];
  const emitted = new Set();
  for (const { file, added } of parseHunks(diffText)) {
    if (classifyPath(file).excluded) continue;
    const userFacingPath = classifyPath(file).userFacing;
    const hunkText = added.join("\n");
    for (const raw of added) {
      if (isComment(raw) || !raw.trim()) continue; // comments raise an exec line's score, never trigger alone
      const c = scoreCandidate({ file, line: raw, hunkText, userFacingPath });
      if (!c) continue;
      if (seen.has(c.fingerprint) || emitted.has(c.fingerprint)) continue; // pre-existing or duplicate
      emitted.add(c.fingerprint);
      out.push(c);
    }
  }
  return out;
}

// Parse a `key=value | key=value` record body into an object.
function parseRecordBody(body) {
  const obj = {};
  for (const part of body.split("|")) {
    const m = part.match(/^\s*([A-Za-z_]\w*)\s*=\s*(.*?)\s*$/);
    if (m) obj[m[1].toLowerCase()] = m[2];
  }
  return obj;
}

// Parse the turn's surfaced-gap contract from the assistant text.
function parseSurfaced(turnText) {
  const text = String(turnText || "");
  const nonBlank = text.split(/\r?\n/).filter((l) => l.trim());
  const head = nonBlank.slice(0, STATUS_SCAN_LINES).join("\n");
  const notComplete = /^[^\n]*CAPABILITY STATUS:\s*NOT COMPLETE/im.test(head);
  const gaps = [];
  const absences = [];
  for (const line of text.split(/\r?\n/)) {
    let m;
    if ((m = line.match(/CAPABILITY GAP:\s*(.*)$/i))) gaps.push(parseRecordBody(m[1]));
    else if ((m = line.match(/CAPABILITY ABSENCE:\s*(.*)$/i))) absences.push(parseRecordBody(m[1]));
  }
  return { notComplete, gaps, absences };
}

function recordMatches(rec, candidate) {
  return (rec.symbol && rec.symbol === candidate.symbol) || (rec.id && rec.id === candidate.id);
}

// A terminal, grounded disposition releases an honestly-surfaced gap. BUILD_NOW is NOT terminal
// (the agent promising to build later must keep going, not stop). A TRACKED id must be grounded.
function dispositionReleases(disposition, groundedIds) {
  const d = String(disposition || "");
  if (/BUILD_NOW/i.test(d)) return false;
  const tracked = d.match(/TRACKED:\s*(\S+)/i);
  if (tracked) return groundedIds.includes(tracked[1]);
  const decision = d.match(/USER_DECISION:\s*(\S+)/i);
  if (decision) return Boolean(decision[1]);
  return false;
}

// Decide allow/block for a turn. opts.baseline = pre-existing candidate fingerprints;
// opts.groundedIds = tracker ids proven to exist; opts.preexistingContracts = contract ids that
// predate the turn (a same-turn ADR/test is NOT in here, by design).
function evaluate({ diffText = "", turnText = "", baseline = [], groundedIds = [], preexistingContracts = [] } = {}) {
  const candidates = scanDiff(diffText, { baseline });
  const surfaced = parseSurfaced(turnText);
  const violations = [];
  for (const c of candidates) {
    const absence = surfaced.absences.find((r) => recordMatches(r, c));
    if (absence && /EXPECTED/i.test(absence.status || "") && preexistingContracts.includes(absence.contract)) {
      continue; // legitimate, contractually-expected absence with pre-existing authority
    }
    const gap = surfaced.gaps.find((r) => recordMatches(r, c));
    if (surfaced.notComplete && gap && dispositionReleases(gap.disposition, groundedIds)) {
      continue; // honestly surfaced, NOT COMPLETE, grounded disposition
    }
    violations.push(c);
  }
  return { allow: violations.length === 0, violations, candidates, surfaced };
}

module.exports = {
  HARD_SENTINEL,
  SOFT_STANDIN,
  SYSTEM_GAP,
  SCORE_THRESHOLD,
  scanDiff,
  parseSurfaced,
  evaluate,
  hashId,
};

// CLI. Two shapes (the caller decides what to do with the verdict — this never exits non-zero):
//   File mode (what the hooks use; a large git diff does not JSON-escape cleanly through stdin):
//     --diff <f> [--turn <f>] [--baseline <f>] [--grounded <f>] [--contracts <f>]  -> verdict JSON
//     --fingerprints --diff <f>   -> newline-delimited candidate fingerprints (the baseline snapshot)
//   Stdin mode (fallback): a {diffText,turnText,baseline,...} JSON object on stdin -> verdict JSON.
function runCli(argv) {
  const fs = require("node:fs");
  const flag = (name) => { const i = argv.indexOf(name); return i >= 0 ? (argv[i + 1] || "") : null; };
  const readSafe = (p) => { if (!p) return ""; try { return fs.readFileSync(p, "utf8"); } catch { return ""; } };
  const toLines = (s) => s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  if (flag("--diff") !== null || argv.includes("--fingerprints")) {
    const diffText = readSafe(flag("--diff"));
    if (argv.includes("--fingerprints")) {
      process.stdout.write(scanDiff(diffText, {}).map((c) => c.fingerprint).join("\n"));
      return;
    }
    process.stdout.write(JSON.stringify(evaluate({
      diffText,
      turnText: readSafe(flag("--turn")),
      baseline: toLines(readSafe(flag("--baseline"))),
      groundedIds: toLines(readSafe(flag("--grounded"))),
      preexistingContracts: toLines(readSafe(flag("--contracts"))),
    })));
    return;
  }

  let raw = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (d) => { raw += d; });
  process.stdin.on("end", () => {
    let payload = {};
    try { payload = JSON.parse(raw || "{}"); } catch { /* empty -> empty verdict */ }
    process.stdout.write(JSON.stringify(evaluate(payload)));
  });
}

if (require.main === module) runCli(process.argv.slice(2));
