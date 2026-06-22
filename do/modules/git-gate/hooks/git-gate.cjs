#!/usr/bin/env node
// PreToolUse(Bash|PowerShell) decision logic for the do git gate.
//
// Default-deny allowlist for git: only read-only or explicitly-safe forms pass; anything that
// mutates refs, the index, the working tree, or rewrites history is blocked with a reason.
// Non-git commands pass through untouched. node-only (no outside packages).
//
// Reads the hook payload JSON on stdin. Blocks by writing the reason to stderr and exiting 2
// (PreToolUse exit 2 -> Claude Code blocks the call and feeds stderr back as the reason);
// allows by exiting 0 with no output.
//
// SCOPE: the command is split at unquoted newlines into lines, then each line into shell segments at
// unquoted operators (&& || ; | & etc.), and EVERY segment that invokes git (directly, under a
// leading `sudo`, behind NAME=value env assignments, or behind a known wrapper like
// env/nice/timeout/nohup/xargs/ionice/time/stdbuf) is judged against the allowlist.
// A destructive git command anywhere in a chain is blocked -- e.g. `ls && git reset --hard` and
// `git status && git reset --hard` are both denied. An operator INSIDE a quoted string (a commit
// message like `-m "wip; reset --hard"`) is not a segment break, because the tokenizer resolves the
// quote first. Disguises that bury git inside a `-c`/`bash -c "..."` string are NOT parsed (see the
// circumvention note in the block reason) -- that is the user's call to make manually.
'use strict';

const BLOCK_REASON = [
  'This SPECIFIC git command is blocked by the do git gate (default-deny allowlist).',
  'It is NOT a blanket ban on git, and it does NOT disable committing or pushing.',
  '',
  'ALLOWED (run these normally): `git push` (non-force), `git commit` (incl. -F / --no-edit),',
  '`git add`, `git fetch`, `git pull`, `git clone`, `git apply`, `git mv`, `git init`, and all',
  'read-only inspection (status, log, show, diff, blame, rev-parse, `git branch`/-a/-r/--list,',
  '`git remote -v`/show, ls-files, etc).',
  '',
  'BLOCKED (what triggered this): state-changing / history-rewriting / working-tree-clobbering',
  'forms not on the allowlist -- `git stash` (all subcommands), `git checkout`, `git reset`,',
  '`git restore`, `git rebase`, `git switch`, `git merge`, `git cherry-pick`, force-push, branch',
  'create/delete/rename (`git branch <name>` / -d / -D / -m), `git rm` (deleting tracked files is',
  'USER-ONLY -- to stage a deletion the user already made, use `git add -- <path>`, which stages',
  'removals; a rename is `git mv`), `git clean`, ref-argument branch queries like',
  '`git branch --contains <ref>`, and a destructive git command in any chained shell segment',
  '(`... && git reset --hard`). To check whether a commit is on the remote, use',
  '`git log --all --oneline`, `git rev-parse origin/main`, or `git branch -r` instead.',
  '',
  'COMMIT HOOK / HISTORY BYPASS: `git commit --no-verify` (and `-n`) and `git commit --amend` are',
  'blocked by default -- they skip the commit hooks or rewrite the last commit, which the do workflow',
  'forbids for agent-run commits. If YOU (the user) want to permit them, set the environment variable',
  '`DO_GIT_GATE_ALLOW_COMMIT_BYPASS=1` (e.g. in .claude/settings.json env); then they are allowed.',
  '',
  '=== DO NOT CIRCUMVENT THIS BLOCK ===',
  'This is a policy decision, not a missing permission.',
  '- DO NOT retry the same command under the other shell (the same gate runs on Bash and PowerShell).',
  '- DO NOT chain via pipes/&&/; or wrap in `bash -c` / `pwsh -c` / a script file to disguise the',
  '  subcommand (chained segments are scanned; buried strings are your call to run manually).',
  '- DO NOT base64/hex/quote-escape the command to evade parsing.',
  '- DO NOT spawn a subagent to run it (subagents inherit this gate).',
  '- DO NOT reach for --force / force-push or other public-history rewrites -- those stay denied.',
  'If a state-changing git command is genuinely required, STOP, explain the situation to the user',
  'in plain text, and let the user run it manually. That is the only sanctioned path.',
].join('\n');

const SAFE_BARE = new Set([
  'status', 'log', 'show', 'diff', 'blame', 'shortlog',
  'whatchanged', 'describe', 'fsck', 'help', 'version',
  'clone', 'fetch', 'pull',
  'ls-files', 'ls-tree', 'ls-remote', 'rev-parse', 'rev-list',
  'cat-file', 'count-objects', 'check-ignore', 'check-attr',
  'check-ref-format', 'grep', 'var', 'name-rev', 'for-each-ref',
  'show-branch', 'show-ref',
  'verify-commit', 'verify-tag',
  'annotate', 'archive', 'bugreport', 'check-mailmap', 'cherry',
  'column', 'cvsexportcommit', 'diagnose', 'diff-pairs', 'difftool',
  'fast-export', 'fmt-merge-msg', 'format-patch', 'get-tar-commit-id',
  'imap-send', 'instaweb', 'last-modified', 'merge-base', 'merge-tree',
  'pack-redundant', 'patch-id', 'range-diff', 'request-pull',
  'send-email', 'show-index', 'stripspace', 'verify-pack',
]);

const CONFIG_READ_FLAGS = new Set([
  '--get', '--get-all', '--get-regexp', '--get-urlmatch',
  '--list', '-l', '--show-origin', '--show-scope',
]);

const BRANCH_WRITE_FLAGS = new Set([
  '-d', '-D', '-m', '-M', '-c', '-C',
  '--delete', '--move', '--copy', '--edit-description',
  '--set-upstream-to', '--unset-upstream', '--track', '--no-track',
  '--create-reflog', '--force', '-f',
]);

const TAG_FORBIDDEN_FLAGS = new Set([
  '-d', '-D', '--delete', '--force', '-f', '--create-reflog',
]);

const REMOTE_READ_SUBCMDS = new Set(['show', 'get-url']);
const BUNDLE_READ_SUBCMDS = new Set(['create', 'verify', 'list-heads']);
const WORKTREE_READ_SUBCMDS = new Set(['list']);
const SUBMODULE_READ_SUBCMDS = new Set(['status', 'summary']);
const NOTES_READ_SUBCMDS = new Set(['list', 'show']);
const BISECT_READ_SUBCMDS = new Set(['log', 'view', 'visualize', 'help']);

// commit flags that skip hooks or rewrite history — blocked unless the user opts in (see commitBypassAllowed).
const COMMIT_BYPASS_FLAGS = new Set(['--no-verify', '-n', '--amend']);

// Read-only forms of subcommands that also have ref-mutating forms (kept OUT of SAFE_BARE).
// `reflog` with no subcommand, or `reflog show ...`, is a read; `expire`/`delete` drop recovery refs.
const REFLOG_READ_SUBCMDS = new Set(['show', 'exists']);
const REFLOG_WRITE_SUBCMDS = new Set(['expire', 'delete']);

// Leading command wrappers that exec their trailing argv — git can ride behind them. After a
// wrapper is unwrapped the inner command is re-judged, so a destructive git op cannot slip through.
// Each entry says how many of the wrapper's OWN option tokens to skip before the wrapped command.
const WRAPPERS = {
  env: 'env',         // env [NAME=val...] [-options] cmd
  nice: 'optval',     // nice [-n N] cmd   (also bare `nice cmd`)
  ionice: 'flags',    // ionice [-c N -n N -t ...] cmd
  time: 'flags',      // time [-p] cmd
  nohup: 'none',      // nohup cmd
  xargs: 'flags',     // xargs [-I{} -n N ...] cmd
  timeout: 'optval',  // timeout [opts] DURATION cmd  -> first non-flag is the duration
  stdbuf: 'flags',    // stdbuf -oL -eL cmd
};

// Wrapper short flags that may take a SEPARATE value token (e.g. `nice -n 10`, `ionice -c 2`,
// `xargs -I {}`). Anything else is treated as value-less (e.g. `time -p`, `env -i`) or self-carrying
// (`-oL`, `--signal=TERM`). Used only to find the wrapped command; a literal `git` is never eaten as
// a value (see skipWrapperFlags), and the caller fails closed if git survives but is not the head,
// so this set need not be exhaustive nor collision-free to stay safe.
const WRAPPER_VALUE_FLAGS = new Set([
  '-n', '-c', '-p', '-t', '-I', '-P', '-d', '-s', '-E', '-a', '-L', '-i', '-o', '-e', '-k', '-u',
]);

const SHELL_OPS = new Set([
  '&&', '||', ';', '|', '&', '`', '>', '>>', '<', '<<', '<<<',
]);

const GLOBAL_FLAG_BARE = new Set([
  '--no-pager', '--paginate', '--no-replace-objects', '--bare',
  '--literal-pathspecs', '--glob-pathspecs', '--noglob-pathspecs',
  '--icase-pathspecs', '--no-optional-locks',
]);
const GLOBAL_FLAG_PREFIX = [
  '--exec-path=', '--git-dir=', '--work-tree=', '--namespace=',
  '--super-prefix=', '--config-env=', '-C',
];

// The user may permit commit hook/history bypasses (`--no-verify` / `--amend`) at their direction.
function commitBypassAllowed() {
  return /^(1|true|yes)$/i.test(process.env.DO_GIT_GATE_ALLOW_COMMIT_BYPASS || '');
}

// POSIX-ish tokenizer mirroring Python shlex.split(posix=True). Throws on an unbalanced quote or
// a trailing backslash (the caller fails open to a naive whitespace split, as the original does).
function shlexSplit(s) {
  const toks = [];
  let cur = '';
  let has = false;
  let i = 0;
  const n = s.length;
  const isWs = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v';
  while (i < n) {
    const c = s[i];
    if (c === '\\') {
      if (i + 1 < n) { cur += s[i + 1]; has = true; i += 2; }
      else { throw new Error('trailing backslash'); }
    } else if (c === "'") {
      has = true; i += 1;
      let buf = '';
      while (i < n && s[i] !== "'") { buf += s[i]; i += 1; }
      if (i >= n) throw new Error('no closing quote');
      cur += buf; i += 1;
    } else if (c === '"') {
      has = true; i += 1;
      let buf = '';
      while (i < n && s[i] !== '"') {
        if (s[i] === '\\' && i + 1 < n && (s[i + 1] === '"' || s[i + 1] === '\\')) {
          buf += s[i + 1]; i += 2;
        } else { buf += s[i]; i += 1; }
      }
      if (i >= n) throw new Error('no closing quote');
      cur += buf; i += 1;
    } else if (isWs(c)) {
      if (has) { toks.push(cur); cur = ''; has = false; }
      i += 1;
    } else {
      cur += c; has = true; i += 1;
    }
  }
  if (has) toks.push(cur);
  return toks;
}

function stripGlobalFlags(args) {
  const out = args.slice();
  while (out.length) {
    const tok = out[0];
    if (GLOBAL_FLAG_BARE.has(tok)) { out.shift(); continue; }
    if (tok === '-c' && out.length >= 2) { out.shift(); out.shift(); continue; }
    if (tok.startsWith('-c=')) { out.shift(); continue; }
    if (GLOBAL_FLAG_PREFIX.some((p) => tok.startsWith(p))) {
      out.shift();
      if (tok === '-C' && out.length) { out.shift(); }
      continue;
    }
    break;
  }
  return out;
}

// Split a token list into shell segments at unquoted operators (quotes were already resolved by
// the tokenizer, so an operator inside a commit message is a normal token, not a break).
function splitSegments(tokens) {
  const segs = [];
  let cur = [];
  for (const t of tokens) {
    if (SHELL_OPS.has(t)) { if (cur.length) segs.push(cur); cur = []; }
    else cur.push(t);
  }
  if (cur.length) segs.push(cur);
  return segs;
}

// Is `tok` a leading NAME=value environment assignment (a valid shell VAR=val prefix)?
function isEnvAssignment(tok) {
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(tok);
}

// Strip leading option tokens of a wrapper, returning the remaining argv. Any token starting with
// '-' is consumed; if it could take a separate value (no '=' inside, and not a '--' long-flag that
// is self-contained) the following token is consumed as its value too. This is deliberately
// over-eager: the caller fails CLOSED if git survives but is not the head, so an imperfect skip
// cannot let a disguised destructive git op through.
function skipWrapperFlags(toks) {
  let out = toks.slice();
  while (out.length && out[0].startsWith('-') && out[0] !== '--') {
    const f = out[0];
    out = out.slice(1);
    // `--flag=value` and glued short flags (`-oL`, `-c2`) carry their own value; only a KNOWN
    // value-taking bare short flag (`-n 10`, `-c 2`, `-I {}`) consumes the following token. NEVER
    // consume a literal `git` as a flag value (the same short flag means different things across
    // wrappers, e.g. `time -p` vs `ionice -p`) -- keep git as the head so it is judged, not hidden.
    if (WRAPPER_VALUE_FLAGS.has(f) && out.length && !out[0].startsWith('-') && out[0] !== 'git') {
      out = out.slice(1);
    }
  }
  return out;
}

// Resolve the real command behind leading env assignments and known wrappers (env/nice/timeout/...).
// Returns { toks, unwrapped } where toks is the inner argv and unwrapped is true if any wrapper or
// assignment prefix was peeled (so the caller can fail closed on a buried git).
function unwrapCommand(seg) {
  let toks = seg.slice();
  let unwrapped = false;
  // Loop: env assignments and wrappers can stack (`FOO=bar nohup nice git ...`).
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (toks.length && isEnvAssignment(toks[0])) { toks = toks.slice(1); unwrapped = true; continue; }
    if (toks.length && Object.prototype.hasOwnProperty.call(WRAPPERS, toks[0])) {
      const kind = WRAPPERS[toks[0]];
      toks = toks.slice(1);
      unwrapped = true;
      if (kind === 'env') {
        // env [NAME=val | -options] cmd
        while (toks.length && (isEnvAssignment(toks[0]) || (toks[0].startsWith('-') && toks[0] !== '--'))) {
          const f = toks[0];
          toks = toks.slice(1);
          if (!isEnvAssignment(f) && (f === '-u' || f === '--unset') && toks.length && toks[0] !== 'git') toks = toks.slice(1);
        }
      } else if (kind === 'flags') {
        toks = skipWrapperFlags(toks);
      } else if (kind === 'optval') {
        // skip leading flags, then ONE positional (nice adjustment / timeout DURATION) if present.
        toks = skipWrapperFlags(toks);
        if (toks.length && !toks[0].startsWith('-') &&
            !Object.prototype.hasOwnProperty.call(WRAPPERS, toks[0]) && toks[0] !== 'git') {
          toks = toks.slice(1);
        }
      }
      // 'none' (nohup) consumes nothing further.
      continue;
    }
    break;
  }
  return { toks, unwrapped };
}

// Judge ONE shell segment. A segment that does not invoke git is allowed (the gate only governs
// git); a git command (optionally under a leading `sudo`, env assignments, or a known wrapper such
// as env/nice/timeout/nohup) is judged against the allowlist.
function segmentAllowed(seg) {
  if (seg.length === 0) return true;
  const hasSudo = seg.includes('sudo');
  let toks = seg;
  while (toks.length && toks[0] === 'sudo') toks = toks.slice(1);
  // Peel env assignments (GIT_DIR=.git ...) and known wrappers (env/nice/timeout/nohup/...), then
  // re-judge the inner command so a destructive git op cannot hide behind a prefix.
  const { toks: inner, unwrapped } = unwrapCommand(toks);
  toks = inner;
  if (toks.length === 0 || toks[0] !== 'git') {
    // Not a (head) git command. Fail CLOSED if git was buried behind sudo/a wrapper/assignment and
    // our prefix-skip did not cleanly land on it -- a disguised `... git reset --hard` must not pass.
    return !((hasSudo || unwrapped) && toks.includes('git'));
  }
  if (hasSudo) return false; // sudo + git -> always blocked
  const rest = stripGlobalFlags(toks.slice(1));
  if (rest.length === 0) return true;
  const sub = rest[0];
  const tail = rest.slice(1);

  if (SAFE_BARE.has(sub)) return true;
  if (sub === 'init') return true;
  if (sub === 'config') return tail.some((t) => CONFIG_READ_FLAGS.has(t));
  if (sub === 'reflog') {
    // read-only: bare `git reflog`, `git reflog show ...`, `git reflog exists <ref>`.
    // blocked: `expire` / `delete` (and `--expire*` flags) drop recovery refs.
    const positional = tail.filter((t) => !t.startsWith('-'));
    const verb = positional[0];
    if (verb !== undefined && !REFLOG_READ_SUBCMDS.has(verb)) return false;
    if (REFLOG_WRITE_SUBCMDS.has(verb)) return false;
    if (tail.some((t) => t === '--expire' || t.startsWith('--expire='))) return false;
    return true;
  }
  if (sub === 'symbolic-ref') {
    // read-only: `git symbolic-ref HEAD` / `--short HEAD`. blocked: setting a ref (a target arg)
    // or `--delete`/`-d` rewrites/removes HEAD (or another symref).
    if (tail.some((t) => t === '-d' || t === '--delete')) return false;
    const positional = tail.filter((t) => !t.startsWith('-'));
    // <name> alone is a read; <name> <ref> writes the symref.
    return positional.length <= 1;
  }
  if (sub === 'branch') {
    if (tail.some((t) => BRANCH_WRITE_FLAGS.has(t))) return false;
    for (const t of tail) {
      if (!t.startsWith('-') && t !== 'HEAD' && !t.includes('@{')) return false;
    }
    return true;
  }
  if (sub === 'tag') return !tail.some((t) => TAG_FORBIDDEN_FLAGS.has(t));
  if (sub === 'remote') {
    if (tail.length === 0 || tail[0] === '-v' || tail[0] === '--verbose') return true;
    return REMOTE_READ_SUBCMDS.has(tail[0]);
  }
  if (sub === 'stash') return false;
  if (sub === 'bundle') return tail.length > 0 && BUNDLE_READ_SUBCMDS.has(tail[0]);
  if (sub === 'worktree') return tail.length > 0 && WORKTREE_READ_SUBCMDS.has(tail[0]);
  if (sub === 'submodule') return tail.length > 0 && SUBMODULE_READ_SUBCMDS.has(tail[0]);
  if (sub === 'notes') return tail.length > 0 && NOTES_READ_SUBCMDS.has(tail[0]);
  if (sub === 'bisect') return tail.length > 0 && BISECT_READ_SUBCMDS.has(tail[0]);
  if (sub === 'diff-tree' || sub === 'diff-index' || sub === 'diff-files') return true;
  if (sub === 'add') {
    if (tail.length === 0) return false;
    for (const t of tail) {
      if (t === '-p' || t === '--patch' || t === '-i' || t === '--interactive') return false;
    }
    return true;
  }
  if (sub === 'commit') {
    if (tail.some((t) => t === '--allow-empty' || t === '--allow-empty-message')) return false;
    if (!commitBypassAllowed() && tail.some((t) => COMMIT_BYPASS_FLAGS.has(t) || t.startsWith('--amend='))) return false;
    return true;
  }
  if (sub === 'apply') return true;
  if (sub === 'rm') return false;
  if (sub === 'mv') return tail.length > 0 && !tail.some((t) => t === '-f' || t === '--force');
  if (sub === 'push') {
    const forbidden = new Set([
      '-f', '--force', '--force-with-lease', '--force-if-includes',
      '--delete', '-d', '--mirror', '--prune', '--all', '--tags',
      '--follow-tags', '--atomic', '--repo',
    ]);
    const forbiddenPrefix = [
      '--force-with-lease=', '--force-if-includes=', '--repo=',
      '--receive-pack=', '--exec=',
    ];
    for (const t of tail) {
      if (forbidden.has(t)) return false;
      if (forbiddenPrefix.some((p) => t.startsWith(p))) return false;
      if (t.startsWith('+')) return false;
      if (t.includes(':') && !t.startsWith('-')) return false;
    }
    return true;
  }
  return false;
}

// Split the raw command on UNQUOTED newlines / carriage returns into separate lines. A newline is a
// shell command separator (like `;`), but the tokenizer treats it as whitespace -- without this a
// `git status` line followed by a `git reset --hard` line would collapse into one segment whose head
// is the allowlisted `status`. A newline INSIDE a quote (a multi-line commit message) is preserved,
// because quotes/backslashes are honored here exactly as the tokenizer honors them.
function splitRawLines(command) {
  const lines = [];
  let cur = '';
  let quote = null; // "'" or '"' when inside a quoted span
  for (let i = 0; i < command.length; i += 1) {
    const c = command[i];
    if (c === '\\' && quote !== "'") {
      // backslash escapes the next char (outside single quotes); keep both so the tokenizer sees them.
      cur += c;
      if (i + 1 < command.length) { cur += command[i + 1]; i += 1; }
      continue;
    }
    if (quote) {
      cur += c;
      if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"') { quote = c; cur += c; continue; }
    if (c === '\n' || c === '\r') { lines.push(cur); cur = ''; continue; }
    cur += c;
  }
  lines.push(cur);
  return lines;
}

// A whole command is allowed only if EVERY shell segment of EVERY line is allowed.
function isAllowed(command) {
  for (const line of splitRawLines(command)) {
    if (line.trim().length === 0) continue;
    let tokens;
    try {
      tokens = shlexSplit(line);
    } catch (e) {
      // Unbalanced quotes / heredoc-ish content that legitimately appears INSIDE a commit message.
      // Fail OPEN to a naive whitespace split; a destructive git subcommand still stays denied.
      tokens = line.split(/\s+/).filter((t) => t.length > 0);
    }
    for (const seg of splitSegments(tokens)) {
      if (!segmentAllowed(seg)) return false;
    }
  }
  return true;
}

function decide(command) {
  if (!command || command.trim().length === 0) return null;
  return isAllowed(command) ? null : BLOCK_REASON;
}

function main() {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (d) => { raw += d; });
  process.stdin.on('end', () => {
    let payload;
    try {
      payload = JSON.parse(raw || '{}');
    } catch (e) {
      process.exit(0); // not our shape -> allow
      return;
    }
    const cmd = ((payload.tool_input || {}).command) || payload.command || '';
    const reason = decide(String(cmd));
    if (reason === null) { process.exit(0); return; }
    process.stderr.write(reason + '\n');
    process.exit(2);
  });
}

// Exported for the test harness; runs as a hook when invoked directly.
if (require.main === module) {
  main();
} else {
  module.exports = {
    isAllowed, decide, segmentAllowed, splitSegments, shlexSplit, stripGlobalFlags,
    splitRawLines, unwrapCommand,
  };
}
