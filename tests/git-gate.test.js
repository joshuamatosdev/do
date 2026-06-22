const { test } = require("node:test");
const assert = require("node:assert");
const { decide } = require("../do/modules/git-gate/hooks/git-gate.cjs");

// Policy contract for the git gate (decision logic in git-gate.cjs). decide(cmd) returns a
// reason string to BLOCK, or null to ALLOW. This locks the default-deny allowlist: only
// read-only / explicitly-safe git forms pass; anything that mutates refs, the index, the
// working tree, or rewrites history is blocked. Parity with the tuned policy this replaces was
// verified out-of-band against the reference implementation across a 140-command corpus; this
// test keeps the policy from drifting. The self-gate + exit-2 wiring is covered separately in
// hooks-self-gate.test.js.
const ALLOW = (cmd) => assert.equal(decide(cmd), null, `expected ALLOW: ${cmd}`);
const BLOCK = (cmd) => assert.equal(typeof decide(cmd), "string", `expected BLOCK: ${cmd}`);

test("non-git commands are not governed", () => {
  ["", "ls -la", "npm test", "rm -rf /tmp/x"].forEach(ALLOW);
});

test("read-only git is allowed", () => {
  ["git status", "git log --all --oneline", "git diff", "git show HEAD", "git fetch",
   "git pull", "git rev-parse origin/main", "git branch -r", "git branch --list",
   "git remote -v", "git remote show origin", "git ls-files"].forEach(ALLOW);
});

test("history-rewriting / working-tree-clobbering git is blocked", () => {
  ["git reset --hard", "git reset --soft HEAD~1", "git checkout main", "git restore f",
   "git switch main", "git merge feature", "git rebase main", "git rebase -i HEAD~3",
   "git cherry-pick abc", "git clean -fd"].forEach(BLOCK);
});

test("stash is banned entirely; rm is user-only", () => {
  ["git stash", "git stash list", "git stash pop", "git rm f", "git rm --cached f"].forEach(BLOCK);
});

test("commit hook/history bypasses are blocked by default", () => {
  ["git commit -m x", 'git commit -m "fix: a; b"', "git commit -F /tmp/msg",
   'git commit -m "wip; reset --hard"'].forEach(ALLOW);
  ["git commit --no-verify -m wip", "git commit -n -m wip", "git commit --amend",
   "git commit --amend --no-edit", "git commit --allow-empty -m x",
   "git commit --allow-empty-message"].forEach(BLOCK);
});

test("commit bypass is permitted at user direction (env override)", () => {
  const prev = process.env.DO_GIT_GATE_ALLOW_COMMIT_BYPASS;
  try {
    process.env.DO_GIT_GATE_ALLOW_COMMIT_BYPASS = "1";
    ["git commit --no-verify -m wip", "git commit --amend --no-edit"].forEach(ALLOW);
    BLOCK("git commit --allow-empty -m x"); // --allow-empty is not part of the bypass override
  } finally {
    if (prev === undefined) delete process.env.DO_GIT_GATE_ALLOW_COMMIT_BYPASS;
    else process.env.DO_GIT_GATE_ALLOW_COMMIT_BYPASS = prev;
  }
});

test("add: staging allowed, interactive/patch blocked, bare blocked", () => {
  ["git add .", "git add -A", "git add -- path"].forEach(ALLOW);
  ["git add -p", "git add -i", "git add"].forEach(BLOCK);
});

test("push: normal allowed, every force/destructive form blocked", () => {
  ["git push", "git push origin main", "git push -u origin main"].forEach(ALLOW);
  ["git push --force", "git push -f", "git push --force-with-lease",
   "git push --force-with-lease=main", "git push --delete origin x", "git push --mirror",
   "git push --all", "git push --tags", "git push origin +main",
   "git push origin local:remote"].forEach(BLOCK);
});

test("branch: listing allowed, create/delete/rename and ref-arg queries blocked", () => {
  ["git branch", "git branch -a", "git branch --contains HEAD"].forEach(ALLOW);
  ["git branch newfeature", "git branch -d old", "git branch -D old", "git branch -m a b",
   "git branch --contains main"].forEach(BLOCK);
});

test("config reads allowed, writes blocked", () => {
  ["git config --list", "git config --get user.name"].forEach(ALLOW);
  ["git config user.name x", "git config --global user.email a@b"].forEach(BLOCK);
});

test("safe extras allowed; global-flag smuggling still resolves to the real subcommand", () => {
  ["git apply patch.diff", "git mv a b", "git init", "git worktree list",
   "git submodule status", "git -c core.pager=cat log", "git -C /repo status"].forEach(ALLOW);
  // -c k=v / -C <path> are stripped, then the REAL subcommand is judged -> still blocked.
  ["git mv -f a b", "git -c x=y reset --hard", "git -C /r push --force"].forEach(BLOCK);
});

test("every shell segment is scanned, not just the leading command", () => {
  BLOCK("git status && git reset --hard");   // destructive git in a later segment
  BLOCK("git reset --hard && echo done");
  BLOCK("echo x | git rm y");                 // git rm piped after a non-git command
  BLOCK("ls && sudo git reset --hard");       // sudo + git in a later segment
  ALLOW("git status && git log --oneline");   // both segments read-only
  ALLOW('git commit -m "wip; reset --hard"'); // the ; is inside the quoted message -> one segment
});

// --- Regression: fail-open bypasses found by the public-readiness audit ---

test("BYPASS(1): an unquoted newline is a segment separator, not whitespace", () => {
  // Old bug: the tokenizer treated \n as whitespace but it was NOT a segment break, so the
  // allowlisted first line ("git status") swallowed the destructive second line.
  BLOCK("git status\ngit reset --hard");
  BLOCK("git status\r\ngit reset --hard");          // CRLF
  BLOCK("echo ok\ngit clean -fd");                  // destructive git on its own line after a non-git line
  BLOCK("git log\n\ngit push --force");             // blank line between, force-push still caught
  ALLOW("git status\ngit log --oneline");           // every line read-only -> allowed
  ALLOW('git commit -m "line one\nline two"');      // newline INSIDE a quoted message is preserved (one segment)
});

test("BYPASS(2): env assignments and command wrappers are unwrapped, then re-judged", () => {
  // Old bug: segmentAllowed only stripped a leading `sudo`; any segment whose first token was not
  // literally `git` returned allowed, so an env prefix or a wrapper hid the destructive op.
  BLOCK("GIT_DIR=.git git reset --hard");           // env assignment prefix
  BLOCK("GIT_WORK_TREE=/tmp git checkout .");       // GIT_WORK_TREE must not let a clobber through
  BLOCK("FOO=bar git clean -fd");                   // arbitrary assignment prefix
  BLOCK("env git reset --hard");                    // env wrapper
  BLOCK("env -i git reset --hard");
  BLOCK("nice git clean -fd");
  BLOCK("nice -n 10 git reset --hard");             // wrapper with a value-flag
  BLOCK("ionice -c2 -n0 git clean -fd");
  BLOCK("time git reset --hard");
  BLOCK("time -p git reset --hard");                // -p is value-less for `time` (must keep git as head)
  BLOCK("nohup git reset --hard");
  BLOCK("xargs git reset --hard");
  BLOCK("timeout 5 git reset --hard");              // skip the DURATION positional, then judge git
  BLOCK("stdbuf -oL git reset --hard");
  BLOCK("FOO=bar nohup nice git reset --hard");     // stacked assignment + wrappers
  BLOCK("echo ok\nGIT_DIR=.git git reset --hard");  // newline + env-prefix combined
  // Legitimate uses still pass: wrappers/assignments in front of READ-ONLY git, and non-git commands.
  ALLOW("nohup git status");
  ALLOW("timeout 5 git status");
  ALLOW("env FOO=bar git status");
  ALLOW("GIT_DIR=.git git status");
  ALLOW("nice -n 10 git log --oneline");
  ALLOW("timeout 5 npm test");                       // wrapped non-git command is untouched
  ALLOW("env FOO=bar node script.js");
});

test("BYPASS(3): ref-mutating symbolic-ref / reflog forms are blocked; reads allowed", () => {
  // Old bug: `symbolic-ref` and `reflog` were in SAFE_BARE, so the mutating forms passed --
  // `symbolic-ref HEAD <ref>` rewrites HEAD and `reflog expire/delete` drops recovery refs.
  BLOCK("git symbolic-ref HEAD refs/heads/evil");   // rewrites HEAD
  BLOCK("git symbolic-ref -d HEAD");
  BLOCK("git symbolic-ref --delete HEAD");
  BLOCK("git reflog expire --expire=now --all");    // drops recovery
  BLOCK("git reflog delete HEAD@{0}");
  BLOCK("git reflog expire --all");
  ALLOW("git reflog");                               // read-only forms still pass
  ALLOW("git reflog show HEAD");
  ALLOW("git reflog exists refs/heads/main");
  ALLOW("git symbolic-ref HEAD");
  ALLOW("git symbolic-ref --short HEAD");
});
