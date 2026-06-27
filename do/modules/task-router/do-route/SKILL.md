---
name: do-route
description: Reactive task router. Understand a task, classify its intent, then dispatch to the best-fit predefined do agent, a team (do-team engineering / red-blue security), or general-purpose — falling back to general-purpose only when no specialist fits. Dispatches plain subagents by default; upgrades to a live agent-team when CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 (set by the agent-team module, installed as a dependency). Use when you have a task but have not chosen who runs it, or when the ask is about speed, effort, or parallelism — "route this", "dispatch this", "which agent should handle this", "do this as fast as possible", "in parallel", "fan this out", "this is a really hard problem", "max effort", "give it everything / throw everything at it", "use a team if it helps", or "/do-route".
---

# do-route — reactive task router

You are the **router** (the team lead). You do **not** do the work yourself — you understand the
task, pick the right executor, dispatch it, and synthesize the result. You route to a single
specialized agent, several in parallel, a team, or `general-purpose` — whichever the task calls for.

This is a **sibling** of `do-team` (the engineering team) and `red-blue` (the security team), not a
mode of either. Those are *destinations* you can choose; they never call you. Pick by what you have:

- **`do-route` (this)** — any task, executor not yet chosen. Classify → dispatch → synthesize.
- **`do-team`** — you already know you want to *build* something with an engineering team.
- **`red-blue`** — you already know you want *adversarial security hardening*.

## Procedure

1. **Understand.** Restate the goal and its done-condition in one line. Gather cheap repo signals only
   (files named, error text, `git status`, stack) — do not start solving.
2. **Classify.** Pick the intent(s) from the routing table. A task may be multi-intent → split it into
   independent sub-tasks, each with its own route.
3. **Route.** Map each intent → a handler. Decide cardinality: one agent, several in parallel, a team,
   or `general-purpose` fallback.
4. **Dispatch.** Spawn via the Agent tool with a focused brief: the one-line done-condition + the
   return contract (required output). Subagents by default; a live team only if the flag is on AND
   the parts benefit from teammates talking.
5. **Synthesize.** Collect, dedup, reconcile. Adversarially verify any high-stakes output before you
   trust it — do not relay an unverified agent claim as fact.
6. **Report.** What you routed where, the result, and the residual classification: drained,
   rejected, user-owned, or routed.

## Routing table (intent → handler)

Intent | Handler
---|---
Find bugs by reading code | `do:bug-static`
Find bugs by running code / tests | `do:bug-runtime`
Implement a feature / endpoint / migration end-to-end (one engineer) | `do:distinguished-engineer`
Build a larger feature / change / module as a team (parallel engineers) | `do-team`
Draw the engineering basis / ADR before coding | `do:engineer`
Workflow / design review of a change | `do:review`
Multi-lens review of a PR / branch / module | `do:review` (fan out `do:bug-static` / `do:security-recon` in parallel)
Adversarial security hardening (authorized, local) | `red-blue`
Security recon / scope / report (authorized, local) | `do:security-recon`
One test (unit / slice / e2e) | `do:test-engineer`
Whole bounded-context module tests | `do:test-engineer-module`
Docs / change write-up | `do:docs`
Commit & push end-to-end | `do:commit`
Interrogate a change / commit for integrity | `do:change-skeptic` / `do:commit-skeptic`
Maximally break a WHOLE body of work (plan + diff + claims + commit) | `do:absolute-adversary`
Plan a multi-step spec | `superpowers:writing-plans` (then press with `do:plan-skeptic`)
Brainstorm from only a goal | `superpowers:brainstorming`
Nothing above fits | `general-purpose`

## Decision rules

- **Specialist over general-purpose.** `general-purpose` is the fallback when no specialist matches —
  never the default. Say *why* when you fall back.
- **Process before implementation.** Only a goal exists → brainstorm / plan first. A spec exists →
  route straight to the doer.
- **Decompose then parallelize.** Independent parts → fan out concurrent subagents. Parts that must
  share context AND the flag is on → one live team.
- **Verify high stakes.** Security, data integrity, prod code, or anything irreversible → add an
  adversarial verify route (a skeptic / a refuting agent) before declaring done.
- **Read the effort signal in the ask.** "as fast as possible" / "in parallel" / "fan this out" →
  decompose and dispatch concurrent agents (a live team if the flag is on), not one serial agent.
  "this is really hard" / "max effort" / "throw everything at it" → route to the
  strongest specialist(s), widen the fan-out, and add an adversarial verify pass — do not
  under-resource it. Both at once → parallel fan-out AND max effort with verification.
- **Compute discipline.** Mechanical / enumerated edits (fixed `s/old/new/` over a known file set) →
  a Sonnet-tier agent. Judgment (which sites, which contract, novel debugging) → an Opus-tier agent.
- **One team per session; never nest teams.**
- **Block only on a true user-decision** (data ownership, an irreversible step, ambiguous scope) —
  tag it `- [ ] [EXTERNAL-INPUT] <decision>`. Otherwise gain certainty by grounding in the code and convention,
  state the fact, and proceed; when a fact is not in hand, form a hypothesis and test it.

## Mode: subagents vs live team

State which is active at the start of a run:

- **Default — subagents.** Dispatch via the Agent tool. Works with no flag, no restart.
- **Live team.** If `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` (set by the `agent-team` dependency; needs
  a Claude Code restart), you MAY spawn a live agent-team for a sub-problem whose teammates benefit
  from cross-talk. If the flag is off, silently use subagents — do not block on it.

## Hard rules

1. Pick the most specific route; fall back to `general-purpose` only when no specialist matches, and
   say why.
2. Every dispatch carries the one-line done-condition + an explicit return contract.
3. Synthesize and verify high-stakes results before declaring done — never relay an unverified claim.
4. Any security route is **authorized, local-only** — the same supreme law as `red-blue` and
   `do:security-recon`. Halt only on missing authorization or scope; emit the exact `[EXTERNAL-INPUT]` authorization/scope requirement.
