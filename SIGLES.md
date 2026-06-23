# SIGLES — user-invokable `+` procedures (Claude-maintained)

A **sigle** is a named, reusable procedure you invoke by typing its **sigil** `+name` (e.g. `+dod`,
`+bugs`). Sigles are *dynamic, lightweight skills kept like memories*: Claude writes, updates, and
prunes them here; you run them. They are NOT registered Claude Code skills — when a sigle grows large
or broadly reusable, graduate it to a real skill (`superpowers:writing-skills`).

## How sigles work

- **Invoke** — type `+name` in a prompt. Claude reads this file, matches the sigle by its **name**,
  runs its **Do** steps, and grounds the result per its **Proof**. Run several at once by listing
  them: `+bugs +simplify`.
- **Unknown name** — if `+name` is not in the Index below, say so plainly and offer
  `+sigle new <name>: …`. Never silently ignore an unknown `+name`, and never invent a procedure for it.
- **Safe by design** — `+name` is a literal bare word in Bash, PowerShell, and cmd; it never silently
  expands the way `$name` does, and as a command it fails loud, not silent. Two edges only: a line
  that *starts* with `+ ` (plus then space) renders as a Markdown bullet — write `+dod` with no
  leading space; and in a URL query, encode it `%2Bdod`.
- **Maintained by Claude, like memories** — one sigle per concern; update the existing entry rather
  than duplicate; delete a sigle that is wrong or stale; before running one, confirm its cited tooling
  still exists (sigles rot like memories).
- **Bounded** — a sigle holds a short procedure only: no secrets, no pasted transcripts, no giant
  copied context.
- **Manage** — `+sigle` creates, lists, updates, or prunes sigles; `+promote` graduates one to a
  real skill when it has outgrown this catalog.

## Index

- `+sigle` — create / list / update / prune sigles
- `+promote` — graduate a sigle into a real Claude Code skill
- `+skills` — what skills are & how to use them
- `+dod` — definition of done (goal + acceptance criteria)
- `+progress` — record of what's been done so far
- `+bugs` — bugs noticed this session
- `+perfcheck` — performance wins noticed this session
- `+simplify` — simplify worked-on code (no behavior/test change)

---

## `+sigle` — create / list / update / prune sigles

Purpose: keep this catalog healthy and grow it on demand.

Do: to CREATE — `+sigle new <name>: <what it should do>` (strip any leading `+` from `<name>`, so
`new +deps:` and `new deps:` both yield `## +deps`) → author a new `## +<name>` entry in the same
shape as the existing ones (Purpose / Do / Proof) and add its Index line. To LIST — print the Index.
To UPDATE or PRUNE — edit or delete the named entry. Apply the memory-style hygiene above (one per
concern, update don't duplicate, prune stale).

Proof: show the added or edited entry and the changed Index line.

---

## `+promote` — graduate a sigle into a real Claude Code skill

Purpose: turn a bounded sigle that has outgrown this catalog into a tested Claude Code skill, or
decline with a grounded reason.

Do: `+promote <name>` — confirm `## +<name>` exists, read that entry and any cited tooling, then
decide whether it has earned promotion. Promote only when the procedure is stable, broadly reusable,
better triggered as a skill than kept as memory, or needs supporting files/scripts/assets a sigle
should not hold. Do not promote one-off project convention, an unstable idea, or a mechanical rule
that should be enforced by tooling. If promoting, use `superpowers:writing-skills` and its testing
workflow to create the skill in the appropriate Claude Code skill directory (project `.claude/skills`
for repo-local behavior; user `~/.claude/skills` for personal cross-project behavior), then replace
or remove the old sigle entry and update the Index. Do not claim auto-promotion: promotion is an
explicit act, not a native watcher or background pipeline.

Proof: cite the original sigle entry, the promote/decline criteria applied, the created `SKILL.md`
path or no-change reason, the skill verification performed, and the changed or removed Index line.

---

## `+skills` — what skills are & how to use them

Purpose: explain what skills are and how to use them, with examples — without hardcoding the catalog.

Do: skills are named, loadable procedures (the `Skill` tool / `superpowers:using-superpowers`); before
acting, check whether one fits, even a 1% chance. Invoke via the `Skill` tool with the name, or type
`/<name>` for a user-facing one. Read the live set from the session `<system-reminder>` blocks each
session — never memorize the catalog. Examples: vague goal → `superpowers:brainstorming`; a bug →
`superpowers:systematic-debugging`; a written spec → `superpowers:writing-plans` then
`superpowers:executing-plans`; before claiming done → `superpowers:verification-before-completion`.

Proof: name the skill picked and why it fit.

---

## `+dod` — definition of done (goal + acceptance criteria)

Purpose: pin the finish line before building.

Do: write the **goal** (one sentence — the outcome) and the **acceptance criteria** (falsifiable
checks that mean done — these tests pass, behavior X holds, no regression Y). If the user did not
state them, propose them from the request on the smallest fair reading; do not invent scope. Hold a
multi-turn target with `/goal "<measurable condition>"`. Use `superpowers:brainstorming` when only a
goal exists, `superpowers:writing-plans` when a spec does.

Proof: done = every criterion met AND proven, not "it builds".

---

## `+progress` — record of what's been done so far

Purpose: a grounded record of what THIS session actually changed.

Do: list files touched, commits (cite hashes), tests run + result, decisions made, and what remains;
if nothing changed this session, say so plainly rather than emit an empty record. Ground every claim
in a real artifact (git log/diff, command output). For a resumable handoff to a fresh session use
`/do:run handoff`; for the workflow dashboard, `do:run status`.

Proof: every line cites an artifact — no recall-only claims.

---

## `+bugs` — bugs noticed this session

Purpose: surface bugs noticed while working, including ones outside the immediate task.

Do: for each — symptom, `file:line`, and why it is wrong. Confirm before claiming: read the path
(`do:bug-static`) or run it (`do:bug-runtime`), and use `superpowers:systematic-debugging` on a real
failure. Fix what is in scope; classify discovered work; drain safe/relevant/tool-executable items;
reject unrelated or user-owned items — never silently change unrelated code.

Proof: each bug cites `file:line` plus the failing path or test.

---

## `+perfcheck` — performance wins noticed this session

Purpose: surface performance improvements noticed in the code worked on.

Do: name the hot path or waste (N+1, repeated work, needless allocation or IO, missing index/cache),
the `file:line`, and the expected win. Measure before claiming a gain where you can — for web, the
`chrome-devtools` perf skills (traces, LCP) give real numbers. Propose only; never trade correctness
or clarity for speed unless asked. Classify discovered work; drain safe/relevant/tool-executable
items and reject unrelated or user-owned items.

Proof: a measurement, or a concrete before/after, where feasible.

---

## `+simplify` — simplify worked-on code (no behavior or test change)

Purpose: make code touched this session simpler without changing behavior or tests.

Do: look for dead code, duplication, needless indirection, over-broad types, reinvented stdlib or
library calls. Run the `code-simplifier` agent (or a `simplify` skill if installed — neither ships
with `do`) over the changed surface, or reduce inline if neither is present. The existing tests
staying green is the invariant — if a test must change, that is a behavior change, not a
simplification. Quality only — for bugs use `+bugs` or `/code-review`.

Proof: tests green before and after; the diff shows only equivalence-preserving edits.

---
