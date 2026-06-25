---
name: do-team
description: Run do's ENGINEERING agents as a Claude Code agent team — decompose a build into tasks, assign each to the right engineering specialist (engineer / distinguished-engineer / test-engineer / docs), integrate, gate, and ship as one coordinated team. Use to BUILD a feature, change, endpoint, or module with multiple engineers working in parallel. Classified residual findings are tracked to a neutral findings.json rendered to a local Markdown tracker (default) or GitHub. Triggers on "build this as a team", "launch an engineering team", "team up to implement X", "spin up a team to build this", "can you get a team on building this", "team work makes the dream work", or "/do-team". For security hardening use red-blue (the security team); when you have a task but have not chosen who runs it, use do-route.
---

# do-team — engineering team

You are the engineering team **lead**. You do **not** write the code yourself — you frame the build,
decompose it, assign each piece to the right engineering specialist, integrate their work, run the
production gate, and ship. `red-blue` is the security team and `do-route` is the router; **this skill
is the team that builds.**

## Preconditions

1. Agent teams enabled: `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` (set by the `agent-team` module on
   install; experimental, token-heavy — each teammate is a full Claude instance). If the flag is off,
   run the same roster as parallel subagents via the Agent tool — do not block on it.
2. For the GitHub residual-tracker sink only: `gh` authenticated (`gh auth status`) + `jq`. The local
   sink needs neither.

## When this vs red-blue vs do-route

- **do-team (this)** — *build* it. An engineering team implements a feature / change / module.
- **red-blue** — *harden* it. The security team (red attack / blue fix).
- **do-route** — you have a task but have not picked who runs it; the router may launch this team.

## Team roster (agent → role)

Agent | Role on the engineering team
---|---
`do:engineer` | the engineering basis / ADR / design note before any code
`do:distinguished-engineer` | production implementation, test-first, full vertical slice
`do:test-engineer` / `do:test-engineer-module` | tests — one unit/slice vs a whole bounded-context module
`do:docs` | docs / change write-up grounded in the diff
`do:review` | internal workflow + design gate before ship
`do:commit` | group, commit, and push the delivered change
`general-purpose` | glue / unspecialized parts with no specialist

## Workflow

### 1 — Frame & decompose

Restate the goal and its done-condition in one line. Name the invariant(s) that must not break. Split
the build into independent tasks with clear interfaces so teammates do not collide.

### 2 — Basis first (when non-trivial)

For a real design choice (data model, contract, security, lifecycle), dispatch `do:engineer` for the
basis / ADR before any code — process before implementation. Skip for a small, well-understood change.

### 3 — Assign & build (fan-out)

Dispatch each task to the right specialist. Parallelize independent tasks; use git-worktree isolation
when teammates edit files concurrently. Compute discipline: mechanical / enumerated edits → a
Sonnet-tier agent, judgment → an Opus-tier agent. Give each a focused brief: the done-condition + the
return contract (files, tests, required output).

Caveats (agent-teams docs): a teammate honors its agent definition's `tools` / `model`, but its
`skills` / `mcpServers` frontmatter is **not** applied; teammates load the project CLAUDE.md + skills
like a normal session; one team per session, no nested teams; teammates inherit the lead's permission
mode.

### 4 — Integrate

Reconcile the teammates' outputs: resolve interface mismatches, de-duplicate, and keep the change
surface bounded (code + tests + docs + config the boundary needs — nothing else).

### 5 — Gate

Before declaring done: tests green, dispatch `do:review` for the production gate (correct, secure,
auditable, observable, testable, operable, no-bypass), and adversarially verify any high-stakes piece.
Never ship on red tests or an unverified claim.

### 6 — Ship

Hand the integrated change to `do:commit` to group, commit, and push (if authorized).

### 7 — Track residuals

Residual findings that are rejected as irrelevant, too broad, externally owned, user-owned, or
approval-gated go to one neutral `findings.json`, rendered to a tracker so nothing is silently
dropped:

```json
{
  "findings": [
    {
      "id": "stable-unique-id",
      "title": "...",
      "severity": "critical | high | medium | low",
      "team": "engineering | tests | docs | ...",
      "category": "...",
      "summary": "...",
      "impact": "...",
      "remediation": "...",
      "evidence": [{ "type": "code", "value": "...", "file": "src/x.js", "line": 12 }],
      "verification": ["..."],
      "references": ["..."],
      "extra_labels": []
    }
  ]
}
```

Give each a deterministic `id` (`<team>-<category>-<short-slug>`); the sinks are idempotent by `id`.

**Local (default, offline):**

```bash
node .claude/skills/do-team/scripts/write-local-findings.js --findings findings.json --dir issues
```

Writes `issues/ISSUE-<id>.md` + `issues/index.md`, idempotent, preserves a `status` you edit.

**GitHub (opt-in, outward-facing):** dry-run, show the user, file only on explicit confirmation:

```bash
bash .claude/skills/do-team/scripts/create-gh-issues-from-findings.sh --findings findings.json --dry-run
# review with the user; only on explicit confirmation:
bash .claude/skills/do-team/scripts/create-gh-issues-from-findings.sh --findings findings.json
```

A sink is any tool that reads `findings.json` and does an idempotent upsert keyed by `id` with a
`--dry-run`; add GitLab / Jira adapters to that contract without changing the workflow.

## Hard rules

1. The lead coordinates; teammates build. Process before implementation; bounded change surface.
2. Never ship on red tests, an unverified high-stakes claim, or without the `do:review` gate.
3. Security-sensitive work is authorized-local-only — for real hardening route to `red-blue`.
4. Never file GitHub issues without a dry-run + explicit user confirmation.
5. One team per session; no nested teams. Residuals are classified and tracked, never silently dropped.
