const { test } = require("node:test");
const assert = require("node:assert");
const { mergeSettings } = require("../lib/merge-settings");

const PARTIAL = {
  hooks: {
    SessionStart: [{ hooks: [{ type: "command", command: "X/load-do-one.sh", _do: true }] }],
    Stop: [{ hooks: [{ type: "command", command: "X/validate-capability-preservation.sh", _do: true }] }],
  },
};

test("adds hooks to empty settings", () => {
  const out = mergeSettings({}, PARTIAL);
  assert.equal(out.hooks.SessionStart.length, 1);
  assert.equal(out.hooks.Stop.length, 1);
});

test("preserves user's existing hooks on the same event", () => {
  const existing = { hooks: { SessionStart: [{ hooks: [{ type: "command", command: "user.sh" }] }] } };
  const out = mergeSettings(existing, PARTIAL);
  const cmds = out.hooks.SessionStart.flatMap((g) => g.hooks.map((h) => h.command));
  assert.ok(cmds.includes("user.sh"), "user hook kept");
  assert.ok(cmds.includes("X/load-do-one.sh"), "do hook added");
});

test("is idempotent — re-merging does not duplicate do hooks", () => {
  const once = mergeSettings({}, PARTIAL);
  const twice = mergeSettings(once, PARTIAL);
  const cmds = twice.hooks.SessionStart.flatMap((g) => g.hooks.map((h) => h.command));
  assert.equal(cmds.filter((c) => c === "X/load-do-one.sh").length, 1);
});

test("preserves unrelated top-level keys", () => {
  const out = mergeSettings({ model: "opus", env: { A: "1" } }, PARTIAL);
  assert.equal(out.model, "opus");
  assert.deepEqual(out.env, { A: "1" });
});

test("preserves user hooks that share a group with a do hook", () => {
  const existing = { hooks: { SessionStart: [{ hooks: [
    { type: "command", command: "user.sh" },
    { type: "command", command: "X/load-do-one.sh", _do: true },
  ] }] } };
  const out = mergeSettings(existing, PARTIAL);
  const cmds = out.hooks.SessionStart.flatMap((g) => g.hooks.map((h) => h.command));
  assert.ok(cmds.includes("user.sh"), "user hook in a mixed group must be kept");
  assert.equal(cmds.filter((c) => c === "X/load-do-one.sh").length, 1, "do hook not duplicated");
});

// Remediation path: legacy installs injected stale ${CLAUDE_PLUGIN_ROOT} `_do` hooks into target
// settings.json (which the current CLI rejects fatally). The hooks now live in the plugin manifest,
// so the spine partial is empty — but `/do update` must still SCRUB those stale entries. Stripping
// must therefore be unconditional, not limited to events the incoming partial happens to declare.
test("remediation: strips stale _do hooks even when the incoming partial is empty", () => {
  const existing = { hooks: {
    SessionStart: [{ hooks: [{ type: "command", command: "X/load.sh", _do: true }] }],
    PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "X/git-gate.sh", _do: true }] }],
  } };
  const out = mergeSettings(existing, {});
  assert.deepEqual(out.hooks, {}, "every _do hook stripped; emptied events removed");
});

test("remediation: strips _do hooks from an event the partial does not declare, keeping user hooks", () => {
  const existing = { hooks: { PreToolUse: [{ hooks: [
    { type: "command", command: "user.sh" },
    { type: "command", command: "X/git-gate.sh", _do: true },
  ] }] } };
  const out = mergeSettings(existing, PARTIAL); // PARTIAL declares SessionStart + Stop, never PreToolUse
  const pre = out.hooks.PreToolUse.flatMap((g) => g.hooks.map((h) => h.command));
  assert.deepEqual(pre, ["user.sh"], "user hook kept; stale _do scrubbed from an undeclared event");
  assert.equal(out.hooks.SessionStart.length, 1, "the partial's own event is still added");
});

// Migration: before partials tagged their hooks `_do: true`, a do hook could land UNtagged.
// The plain `_do` strip misses it, so reinstalling with the now-tagged partial would DUPLICATE it.
// Merging an incoming command that already exists untagged must
// REPLACE it (dedup by exact command), not stack a second copy.
const LEGACY_CMD = `bash "$CLAUDE_PROJECT_DIR/.claude/hooks/codex-${"frontier"}-stop.sh"`;
test("migration: an untagged legacy do hook is not duplicated when the partial re-adds it tagged", () => {
  const legacy = { hooks: { Stop: [{ hooks: [{ type: "command", command: LEGACY_CMD, timeout: 15 }] }] } };
  const tagged = { hooks: { Stop: [{ hooks: [{ type: "command", command: LEGACY_CMD, timeout: 15, _do: true }] }] } };
  const out = mergeSettings(legacy, tagged);
  const stop = out.hooks.Stop.flatMap((g) => g.hooks);
  assert.equal(stop.length, 1, "exactly one legacy do hook (untagged replaced by tagged)");
  assert.equal(stop[0]._do, true, "the surviving hook is the tagged do hook");
});

test("migration: dedup drops the legacy do hook but keeps an unrelated user hook on the same event", () => {
  const existing = { hooks: { Stop: [{ hooks: [
    { type: "command", command: "user-own.sh" },
    { type: "command", command: LEGACY_CMD, timeout: 15 }, // legacy untagged do hook
  ] }] } };
  const tagged = { hooks: { Stop: [{ hooks: [{ type: "command", command: LEGACY_CMD, timeout: 15, _do: true }] }] } };
  const out = mergeSettings(existing, tagged);
  const cmds = out.hooks.Stop.flatMap((g) => g.hooks.map((h) => h.command));
  assert.ok(cmds.includes("user-own.sh"), "unrelated user hook kept");
  assert.equal(cmds.filter((c) => c === LEGACY_CMD).length, 1, "legacy do hook deduped to exactly one");
});

test("mergeSettings unions env, user keys win, absent keys filled", () => {
  const { mergeSettings } = require("../lib/merge-settings");
  const out = mergeSettings(
    { env: { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "0", USER_KEY: "x" } },
    { env: { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1", NEW_KEY: "y" } }
  );
  assert.equal(out.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS, "0"); // user wins
  assert.equal(out.env.USER_KEY, "x");                            // preserved
  assert.equal(out.env.NEW_KEY, "y");                             // filled
});

test("mergeSettings sets env flag when absent and leaves user hooks intact", () => {
  const { mergeSettings } = require("../lib/merge-settings");
  const out = mergeSettings(
    { hooks: { Stop: [{ hooks: [{ command: "user-hook" }] }] } },
    { env: { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1" } }
  );
  assert.equal(out.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS, "1");
  assert.ok(out.hooks.Stop, "user hook (no _do tag) preserved");
});

// --- env strip: symmetric with the _do hook strip ---
// Disabling/uninstalling a module must REMOVE the env var it contributed (the merge was union-only,
// so it used to linger forever). These model the install.js lifecycle: install once WITH the module's
// partial, then re-merge WITHOUT it (module disabled / removed) and assert the key is gone while
// unrelated do keys and user keys survive.

const AGENT_TEAM_PARTIAL = { env: { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1" } };

test("env strip: disabling a module removes the env var it added", () => {
  const installed = mergeSettings({}, AGENT_TEAM_PARTIAL); // module enabled: contributes the key
  assert.equal(installed.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS, "1", "contributed on install");
  const disabled = mergeSettings(installed, {}); // re-merge with the module gone (empty partial)
  assert.ok(
    !(disabled.env && "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS" in disabled.env),
    "the do-contributed env var is stripped once the module no longer contributes it"
  );
});

test("env strip: disabling a module leaves unrelated user env vars intact", () => {
  // User has their own env; then the module is installed (adds its key), then disabled again.
  const withUser = { env: { USER_KEY: "x", ANOTHER: "y" } };
  const installed = mergeSettings(withUser, AGENT_TEAM_PARTIAL);
  const disabled = mergeSettings(installed, {});
  assert.equal(disabled.env.USER_KEY, "x", "user key untouched");
  assert.equal(disabled.env.ANOTHER, "y", "user key untouched");
  assert.ok(
    !("CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS" in disabled.env),
    "only the do-contributed key is removed"
  );
});

test("env strip: a user value that overrode a do key is NOT stripped on disable", () => {
  // Symmetric with the hook strip preserving a user hook that shares a do group:
  // if the user has edited the value away from what do wrote, the key is theirs now.
  const installed = mergeSettings({}, AGENT_TEAM_PARTIAL);
  installed.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = "0"; // user turns it off by hand
  const disabled = mergeSettings(installed, {});
  assert.equal(
    disabled.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS, "0",
    "a user-edited value survives a module disable — it is no longer do-owned"
  );
});

test("env strip: a pre-existing user key with no do ledger is never stripped", () => {
  // Safety: only keys do actually recorded as do-owned are eligible for stripping. A key the user
  // set themselves (no _doEnv ledger entry) must survive even when the partial is empty.
  const out = mergeSettings({ env: { USER_KEY: "keep-me" } }, {});
  assert.equal(out.env.USER_KEY, "keep-me", "untracked user env key is left alone");
});

test("env strip: re-merging the same partial is idempotent (key stays, ledger stable)", () => {
  const once = mergeSettings({}, AGENT_TEAM_PARTIAL);
  const twice = mergeSettings(once, AGENT_TEAM_PARTIAL);
  assert.equal(twice.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS, "1", "still present after re-merge");
  assert.deepEqual(twice._doEnv, once._doEnv, "ledger does not churn on re-merge");
});

test("env strip: a single combined partial keeps every key it still contributes", () => {
  // The supported reconciliation unit is ONE merge per source (install.js merges the spine once,
  // then each module partial once). Within a single partial, every key it declares is kept; a key
  // the source no longer declares on a later merge is the one that gets stripped. This proves the
  // strip is per-key against the contributing partial, not all-or-nothing.
  const BOTH = { env: { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1", DO_OTHER_FLAG: "1" } };
  const installed = mergeSettings({}, BOTH);
  assert.equal(installed.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS, "1");
  assert.equal(installed.env.DO_OTHER_FLAG, "1");
  // Re-merge declaring only one of them: the dropped key is stripped, the kept key stays.
  const narrowed = mergeSettings(installed, { env: { DO_OTHER_FLAG: "1" } });
  assert.equal(narrowed.env.DO_OTHER_FLAG, "1", "still-contributed key kept");
  assert.ok(
    !("CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS" in narrowed.env),
    "no-longer-contributed key stripped"
  );
});

test("env strip: disabling the only env-contributing module drops the env block entirely", () => {
  const installed = mergeSettings({}, AGENT_TEAM_PARTIAL);
  const disabled = mergeSettings(installed, {});
  assert.ok(!("env" in disabled), "an emptied env block is removed, like an emptied hooks event");
  assert.ok(!("_doEnv" in disabled), "the internal do-env ledger is cleared when empty");
});

test("env strip: the _doEnv ledger is internal bookkeeping, not surfaced as an env var", () => {
  const out = mergeSettings({}, AGENT_TEAM_PARTIAL);
  assert.ok(!("_doEnv" in out.env), "_doEnv lives at the top level, never inside env");
});
