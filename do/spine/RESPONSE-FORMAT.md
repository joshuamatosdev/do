# RESPONSE FORMAT

> Reference for response shape — the tier vocabulary and per-tier section floors.
> **No longer auto-injected or enforced:** the SessionStart load, per-turn inject, and Stop-gate
> hooks were removed. Kept as guidance; `CLAUDE.do.md` ("match ceremony to turn tier") still points here.
> **Style:** tables and lists, short text, no walls of text.

## When required

Any turn that is a question, plan, status, debug, implementation, handoff, or completion. Match ceremony to the turn — write to your tier's floor. If the tier is unclear, satisfy the next floor and keep it concise and evidence-based (the gate fails open, so under-writing a heavy turn is the only miss it can't catch).

**Enforcement (removed):** a Stop gate (`validate-response-format.sh`) once blocked a miss only when the turn had proven on-transcript production substance, and advised otherwise. That gate and its session-load / per-turn-inject siblings have been removed — this doc is now reference-only.

## Tiers

Tier is auto-classified from what THIS turn edited (transcript `tool_use`) + the turn's whole assistant-text length (every text block since the last human prompt, not just the closing message). `.claude/`, `docs/`, and `*.md` are safe surfaces — they never raise the tier. A subagent dispatch does **not** raise the tier — the dispatched agent's edits and commits are its own deliverable and audit trail, so the parent ack is judged on its own visible substance only.

Tier | Trigger | Required floor
---|---|---
**TRIVIAL** | turn text < 800 chars, no high-stakes edit | exempt — no structure
**LITE** | config/hook/tooling/docs/one-file/mechanical edit; status; analysis; Q&A (~800–2500 chars of turn text, no high-stakes surface) | `## Goal` · `## Immediate Actions` · `## Remaining Steps` (+ conditional **Bugs:** / **Gaps:** / **Inconsistencies:** when merited)
**REPORT** | long major turn (~2500+ chars of turn text), no high-stakes code surface (audit, write-up, multi-part status) | LITE floor **+** `## Proof`
**FULL** | edits a high-stakes surface (schema/migration files, auth/security config, or ≥ 3 production-code files) | REPORT floor **+** `## Feature Completion Chain` **+** `## Completion Checklist` (both commitments)

## Formatting rules (apply to every gated response)

- Tables for repeated structure; lists for lists of items; never a wall of text.

- Lean tables — no outer border pipes: `col | col`, a `---|---` rule under the header, `|` only between columns.

- Blank line between every numbered-list item.

- Carriage return after a label colon — put the value on the next line, not inline.

- One sentence beats a paragraph. Cut filler.

## Two standing obligations (every gated turn)

1. **Ground every claim in facts from the code** — cite file:line, command output, or file. No recall-only claims. (At REPORT/FULL this is the `## Proof` section.)

2. **External reasoners** — if `codex-integrity` is installed, the unified Stop hook `codex-stop.sh` runs the Codex integrity gate. Use `do:mon` for hard technical/design decisions you cannot settle locally, especially decisions that need code, ideas, definition of done, acceptance criteria, tradeoffs, or a long-term scalable solution. Use the in-response `codex` skill only for genuine judgment calls you cannot verify locally, as a `do:mon` fallback, or when a closed gate requires `codex --decide`; routine grep/read/command-verifiable turns do not need a second reasoner call.

---

## Sections — print the ones your tier requires

> Prefer tables and lists. One sentence beats a paragraph. Cut filler.

### `## Goal`

One sentence — the objective.

### `## Immediate Actions`

The concrete next actions **to fulfill the request** — and you TAKE them this turn, with your tools;
you don't list them and stop. On a non-blocking local detail (a name, a format), do not guess or
assume — gain certainty from the code and convention and state the fact; when a fact is not in hand,
form a hypothesis, state it, and test it. Do not stop to ask a detail you can settle. `- [x] None —
request satisfied` is a clean, valid terminal. Surface hard technical/design decisions as
`- [ ] [DO:MON] <decision>` and immediately run `do:mon` rather than waiting for the user. The
consult prompt should provide relevant code/evidence and ask for code, implementation ideas,
definition of done, acceptance criteria, tradeoffs, and the long-term scalable solution. Reserve
`- [ ] [EXTERNAL-INPUT]` only for a true terminal the agent cannot resolve: a credential it cannot
compute, or a SAFETY_GATE (irreversible AND outward AND consequential — destructive action,
public-release / go-no-go). It is admissible only when EARNED via the terminal-discipline §4
falsification protocol and carrying a RoundLog (§5); `[USER]` is repealed. "Awaiting your direction"
is never a terminal state.

### `## Proof`

REPORT + FULL. Evidence for the claims this turn makes: file:line, command output, test result, or the reason a check was not run. No recall-only claims.

### `## Remaining Steps`

What is left **to fulfill the request** and drain the discovered frontier. One `- [ ] step`
per item; `- [x] None — <proof>` when the request and frontier are complete. An open non-`[EXTERNAL-INPUT]`
item means the turn is **not** done — do it, don't ask.

Work frontier:

1. Finish the requested objective.

2. Classify discovered work.

3. Immediately drain the discovered-work frontier when it is safe, relevant, and tool-executable.

4. Stop only when the frontier contains no worthwhile safe work, or only user-owned/irreversible decisions remain.

Clean up agent-owned processes before stopping. Terminate dev servers, watchers, worker pools,
hook/helper shells, and background toolchain commands you started; do not kill shared or user-owned
processes unless the user explicitly authorizes it.

Execution loop:
`objective -> required fixes -> verification -> discovered frontier -> drain -> verify -> stop`.

The only sanctioned terminal open item is an EXTERNAL-INPUT decision
`- [ ] [EXTERNAL-INPUT] <the credential or SAFETY_GATE approval only the user can provide>`, earned
via terminal-discipline §4 and carrying a RoundLog (§5); `[USER]` is repealed. Hard architecture,
design, outward-impact, acceptance-criteria, tradeoff, or scalability decisions are not terminal
gates; surface them as `- [ ] [DO:MON] <decision>`, consult `do:mon`, verify the answer, choose,
and continue. A blocker escalates to `do:mon`; if `do:mon` is unavailable, use `codex --decide` or
`do:change-skeptic`.

Do not turn agent-created work into a user gate. Rollout, flip-readiness, freshness, backfill,
least-privilege role, reconciler, migration, or operations prerequisites discovered while fulfilling
the requested objective are frontier work when they are safe and tool-executable. Finish them in the
same drain loop, or report the feature as incomplete with evidence; do not ask the user whether to
build them later.

### Bugs / Gaps / Inconsistencies — conditional, only when merited

There is **no** umbrella section and no always-printed header. When this turn noticed extra issues outside the asked work, print only the matching label(s) below — label on its own line, items on the next lines — and **omit any label that has no items**. If nothing was noticed, print nothing here at all. These are NOT gate-required; they appear only when there is something real to report.

Which label: **Bug** = wrong behavior / a defect. **Gap** = missing coverage, validation, doc, or test. **Inconsistency** = two places that disagree (value, contract, name, shape). Use `- [x] No action needed — <why>` for an item that needs none.

**Bugs:**

- [ ] <concrete action> — <what it is + where, file:line>

**Gaps:**

- [ ] <concrete action> — <what it is + where, file:line>

**Inconsistencies:**

- [ ] <concrete action> — <what it is + where, file:line>

### `## Feature Completion Chain`

Nothing is complete until every slice below is addressed with status + evidence. One row per slice:

Slice | Owner / Agent | Status | Evidence | Remaining
---|---|---|---|---

Slices to cover: Schema/data · Backend · Frontend/UI · API contract · Tests (unit/integration/e2e) · Docs.

The `completion-gates` module re-adds domain-specific evidence gates.

N/A is allowed but the row must state **why** + evidence. Never silently skip a slice.

### `## Completion Checklist`

FULL only. Prove both commitments. Mark ✓ / ⚠ / N/A with one-line evidence (file:line, command output, or "no code this turn — <reason>"). Don't pad N/A — give the reason.

**How commitment 1 was met** — end-to-end, frontier drained:

Check | ✓ / ⚠ / N/A | Evidence
---|---|---
No frontier work left undrained — everything required or discovered-safe was attempted this turn | |
No open issues left behind — or surfaced under Bugs / Gaps / Inconsistencies | |
Did not stop at a perceived blocker — pushed through, or user declared it valid | |

**How commitment 2 was met** — engineering discipline (N/A on non-code turns, with reason):

Discipline | ✓ / N/A | Evidence
---|---|---
SOLID | |
12 Factor | |
SUT (unit under test isolated) | |
Given-When-Then | |
BDD test | |
E2E test | |
Edge case test | |

---

## Stop-Work Checklist (confirm before ending a turn)

- Stop only when the request is complete, the discovered frontier is drained, and remaining items are only `- [ ] [EXTERNAL-INPUT]` decisions the agent cannot make (a credential, or a SAFETY_GATE), each earned via terminal-discipline §4 and carrying a RoundLog (§5; `[USER]` is repealed). Do not tag safe tool work, pushable blockers, technical design choices, or beneath-attention trivia as `[EXTERNAL-INPUT]`. Mark hard design/architecture/tradeoff/scalability decisions as `[DO:MON]`, consult `do:mon`, verify the answer, and keep going. Open non-`[EXTERNAL-INPUT]` work or "awaiting your direction" fails the continuation gate; for a real blocker fire `do:mon` first, then `codex --decide` / `do:change-skeptic` only as fallback. For big multi-turn goals, `/goal "<measurable, evidence-based condition>"` holds the loop to completion.

- Agent-created rollout / flip / readiness gates are not terminal user decisions. If they are needed
  for the requested feature to be coherent, drain them or mark the feature incomplete.

- Frontier drained — everything required or discovered-safe was attempted this turn, or surfaced under Bugs / Gaps / Inconsistencies.

- Tests run and green — or stated explicitly that no code changed this turn.

- No secrets or extra files staged — confirmed via `git status --short`.

---

## Tier → required sections (was the Stop gate's source of truth)

These `GATE-REQUIRED:<TIER>` … `GATE-REQUIRED:END` blocks listed the verbatim section headers the Stop gate (`validate-response-format.sh`, now removed) required per tier — the same mapping as the tier table above. They are HTML comments (invisible when the markdown renders); nothing reads them at runtime anymore, kept only as a reference mapping.

<!-- GATE-REQUIRED:LITE
## Goal
## Immediate Actions
## Remaining Steps
GATE-REQUIRED:END -->

<!-- GATE-REQUIRED:REPORT
## Goal
## Immediate Actions
## Proof
## Remaining Steps
GATE-REQUIRED:END -->

<!-- GATE-REQUIRED:FULL
## Goal
## Immediate Actions
## Proof
## Remaining Steps
## Feature Completion Chain
## Completion Checklist
How commitment 1 was met
How commitment 2 was met
GATE-REQUIRED:END -->
