#!/usr/bin/env node
// PreToolUse(Bash|PowerShell) decision logic for the do "route Codex through the skill" gate.
//
// GOAL (positive framing): every Codex consult goes through the `do:codex` SKILL, which applies
// the discipline a raw call skips — secret-scrubbing before egress, forwarding THIS session's
// transcript as neutral context, the pinned gpt-5.5/xhigh model, and verbatim return. A raw
// `codex exec` also skips the scrub entirely (secret-egress risk).
//
// WHAT IS BLOCKED: a shell segment that EXECUTES a Codex consult directly —
//   * the codex CLI in exec mode: `codex exec ...` / `codex e ...` / `codex.cmd exec ...`
//   * the bundled script: `codex.sh` run directly or via an interpreter (`bash .../codex.sh`)
// UNLESS the segment carries the skill's internal marker env `DO_CODEX_VIA_SKILL=1` (the skill
// sets it for its own run). Everything else passes: non-codex commands, INSPECTING codex files
// (`cat`/`grep`/`bash -n codex.sh`), the test suite (`node --test tests/codex-*.test.js`), and
// non-consult codex subcommands (`codex --version` / `codex login` / `codex resume`).
//
// Reads the hook payload JSON on stdin. Blocks by writing the reason to stderr and exiting 2
// (PreToolUse exit 2 -> Claude Code blocks the call and feeds stderr back as the reason); allows
// by exiting 0 with no output. node-only (no outside packages). The self-gate (manifest presence)
// + fail-open (node absent) live in the bash wrapper route-codex-to-skill.sh.
//
// NOTE: the shell tokenizer below mirrors the proven one in do/modules/git-gate/hooks/git-gate.cjs.
// It is intentionally duplicated (not shared) to keep this spine hook free of a cross-module
// dependency; if a third consumer appears, lift these primitives into do/spine/hooks/lib/.
'use strict';

const BLOCK_REASON = [
  'Consult Codex through the do:codex SKILL — do not run `codex` / `codex.sh` directly.',
  '',
  'WHY: the skill (skills/codex/SKILL.md) applies the discipline a raw call skips —',
  'it scrubs secrets BEFORE egress, forwards THIS session\'s transcript as neutral context',
  '(so you do not lead the witness or under-include), pins the gpt-5.5/xhigh model, and returns',
  'Codex\'s answer verbatim. A raw `codex exec` skips the scrub entirely (secret-egress risk).',
  '',
  'DO THIS: invoke the Skill tool -> do:codex — with the user\'s question verbatim, or none to',
  'let Codex infer the open matter from the transcript. The skill runs the script for you with',
  'the right flags and workspace.',
  '',
  '=== DO NOT CIRCUMVENT ===',
  'This is a routing policy, not a missing permission.',
  '- DO NOT hand-build a codex command with extra env to slip past this gate — use the skill.',
  '- DO NOT retry under the other shell, or bury the call in `bash -c "..."` / a script file.',
  '- DO NOT spawn a subagent to run it (subagents inherit this gate).',
  'If codex genuinely must run OUTSIDE the skill, that is the USER\'s call: set the environment',
  'variable DO_CODEX_ROUTE_OFF=1 (e.g. in .claude/settings.json env) to disable this gate.',
].join('\n');

const SHELL_OPS = new Set(['&&', '||', ';', '|', '&', '`', '>', '>>', '<', '<<', '<<<']);
// Leading wrappers that exec their trailing argv — codex can ride behind them. Peeled, then the
// inner head is judged. setsid/timeout/nohup appear in the codex runners; include them.
const WRAPPERS = new Set(['env', 'nice', 'ionice', 'time', 'nohup', 'xargs', 'timeout', 'stdbuf', 'setsid']);
const INTERPRETERS = new Set(['bash', 'sh', 'dash', 'zsh', 'ksh', 'pwsh', 'powershell', 'pwsh.exe', 'powershell.exe']);

// The user may disable this gate outright at their direction.
function routeGateOff() {
  return /^(1|true|yes)$/i.test(process.env.DO_CODEX_ROUTE_OFF || '');
}

function basename(p) { return String(p).split(/[/\\]/).pop(); }
function isCodexBin(t) { const b = basename(t).toLowerCase(); return b === 'codex' || b === 'codex.cmd' || b === 'codex.exe'; }
function isCodexScript(t) { return /codex\.sh$/i.test(String(t)); }
function isInterpreter(t) { return INTERPRETERS.has(basename(t).toLowerCase()); }
function isEnvAssignment(tok) { return /^[A-Za-z_][A-Za-z0-9_]*=/.test(tok); }
function isSkillMarker(tok) { return /^DO_CODEX_VIA_SKILL=(1|true|yes)$/i.test(tok); }

// POSIX-ish tokenizer (mirrors git-gate.cjs). Throws on unbalanced quote / trailing backslash;
// the caller fails open to a whitespace split.
function shlexSplit(s) {
  const toks = []; let cur = ''; let has = false; let i = 0; const n = s.length;
  const isWs = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v';
  while (i < n) {
    const c = s[i];
    if (c === '\\') { if (i + 1 < n) { cur += s[i + 1]; has = true; i += 2; } else { throw new Error('trailing backslash'); } }
    else if (c === "'") { has = true; i += 1; let buf = ''; while (i < n && s[i] !== "'") { buf += s[i]; i += 1; } if (i >= n) throw new Error('no closing quote'); cur += buf; i += 1; }
    else if (c === '"') {
      has = true; i += 1; let buf = '';
      while (i < n && s[i] !== '"') { if (s[i] === '\\' && i + 1 < n && (s[i + 1] === '"' || s[i + 1] === '\\')) { buf += s[i + 1]; i += 2; } else { buf += s[i]; i += 1; } }
      if (i >= n) throw new Error('no closing quote'); cur += buf; i += 1;
    } else if (isWs(c)) { if (has) { toks.push(cur); cur = ''; has = false; } i += 1; }
    else { cur += c; has = true; i += 1; }
  }
  if (has) toks.push(cur);
  return toks;
}

// Split the raw command on UNQUOTED command separators (newline / `;`) into lines. A newline and a
// `;` are command separators, but the tokenizer treats a newline as whitespace and a glued `;`
// (`status; codex`) sticks to its token — without this split a codex segment after a benign one
// would merge and hide. A separator INSIDE a quote (a prompt arg like "do x; then y") is preserved,
// because quotes/backslashes are honored here exactly as the tokenizer honors them.
function splitRawLines(command) {
  const lines = []; let cur = ''; let quote = null;
  for (let i = 0; i < command.length; i += 1) {
    const c = command[i];
    if (c === '\\' && quote !== "'") { cur += c; if (i + 1 < command.length) { cur += command[i + 1]; i += 1; } continue; }
    if (quote) { cur += c; if (c === quote) quote = null; continue; }
    if (c === "'" || c === '"') { quote = c; cur += c; continue; }
    if (c === '\n' || c === '\r' || c === ';') { lines.push(cur); cur = ''; continue; }
    cur += c;
  }
  lines.push(cur);
  return lines;
}

function splitSegments(tokens) {
  const segs = []; let cur = [];
  for (const t of tokens) { if (SHELL_OPS.has(t)) { if (cur.length) segs.push(cur); cur = []; } else cur.push(t); }
  if (cur.length) segs.push(cur);
  return segs;
}

// Strip leading sudo / env assignments / known wrappers so the real head command is judged.
// Best-effort: a failure to peel only risks a MISSED block (a heavily-wrapped codex), never a
// false block — acceptable for a routing nudge.
function peelPrefix(seg) {
  let t = seg.slice(); let changed = true;
  while (changed && t.length) {
    changed = false;
    while (t.length && t[0] === 'sudo') { t = t.slice(1); changed = true; }
    while (t.length && isEnvAssignment(t[0])) { t = t.slice(1); changed = true; }
    if (t.length && WRAPPERS.has(basename(t[0]).toLowerCase())) {
      t = t.slice(1); changed = true;
      while (t.length && t[0].startsWith('-') && t[0] !== '--') { t = t.slice(1); } // wrapper flags
      if (t.length && /^[0-9]+(\.[0-9]+)?[smhd]?$/i.test(t[0])) { t = t.slice(1); } // timeout DURATION / nice N
    }
  }
  return t;
}

// Does this (already-peeled) segment EXECUTE a Codex consult?
function runsCodexConsult(toks) {
  if (!toks.length) return false;
  const head = toks[0];
  if (isCodexBin(head)) {
    const rest = toks.slice(1);
    const firstNonFlag = rest.find((x) => !x.startsWith('-'));
    if (firstNonFlag === 'exec' || firstNonFlag === 'e') return true;
    if (rest.includes('exec')) return true;        // global flags before the subcommand
    return false;                                  // --version / login / resume / bare TUI -> not a consult
  }
  if (isCodexScript(head)) return true;            // ./codex.sh, /path/codex.sh, ${ROOT}/skills/codex/codex.sh
  if (isInterpreter(head)) {
    const rest = toks.slice(1);
    if (rest.includes('-n')) return false;         // `bash -n codex.sh` = syntax check, not execution
    if (rest.some((x) => x === '-c' || x === '-Command' || x === '-EncodedCommand')) return false; // buried string -> user's call
    const fnf = rest.find((x) => !x.startsWith('-'));
    if (fnf && isCodexScript(fnf)) return true;
  }
  return false;
}

function decide(command) {
  if (!command || command.trim().length === 0) return null;
  if (routeGateOff()) return null;                 // user kill switch
  for (const line of splitRawLines(command)) {
    if (line.trim().length === 0) continue;
    let tokens;
    try { tokens = shlexSplit(line); } catch (e) { tokens = line.split(/\s+/).filter((t) => t.length > 0); }
    for (const seg of splitSegments(tokens)) {
      if (seg.length === 0) continue;
      if (seg.some(isSkillMarker)) continue;        // skill-authorized run -> allow
      if (runsCodexConsult(peelPrefix(seg))) return BLOCK_REASON;
    }
  }
  return null;
}

function main() {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (d) => { raw += d; });
  process.stdin.on('end', () => {
    let payload;
    try { payload = JSON.parse(raw || '{}'); } catch (e) { process.exit(0); return; }
    const cmd = ((payload.tool_input || {}).command) || payload.command || '';
    const reason = decide(String(cmd));
    if (reason === null) { process.exit(0); return; }
    process.stderr.write(reason + '\n');
    process.exit(2);
  });
}

if (require.main === module) {
  main();
} else {
  module.exports = { decide, runsCodexConsult, peelPrefix, splitSegments, splitRawLines, shlexSplit };
}
