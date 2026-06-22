# RESPONSE FORMAT

> Main source. Added every session and re-stated every turn; checked at Stop.
> **Load-bearing — keep verbatim:** the `##` section headers and `How commitment 1/2 was met` (the gate searches for them).
> **Everything else:** tables and lists, short text, no walls of text.

## When required

Any turn that is a question, plan, status, debug, implementation, handoff, or completion. Match ceremony to the turn — write to your tier's floor. If the tier is unclear, satisfy the next floor and keep it concise and evidence-based (the gate fails open, so under-writing a heavy turn is the only miss it can't catch).

## Tiers

Tier is auto-classified from what THIS turn edited (transcript `tool_use`) + the turn's whole assistant-text length (every text block since the last human prompt, not just the closing message). `.claude/`, `docs/`, and `*.md` are safe surfaces — they never raise the tier. A turn that dispatched a subagent (its edits live off-transcript) is never exempt — it floors at LITE.

Tier | Trigger | Required floor
---|---|---
**TRIVIAL** | turn text < 800 chars, no high-stakes edit, no subagent dispatch | exempt — no structure
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

2. **Codex** — if the `codex-integrity` module is installed, the Stop `codex-integrity-review` hook **as shipped** is advisory: when `codex` is on PATH it surfaces a reminder to run a Codex integrity review on integrity-watchlist turns (false-inability / feature-loss / degradation); the shipped hook does not block. (An installer MAY harden it to fail closed — e.g. TTX's `.claude/hooks/codex-integrity-review-stop.sh` emits `decision:block` by design; "advisory" describes the shipped default, not a guarantee about every deployment.) Do not also fire the in-response `codex` skill on routine or turns you can verify yourself (config/hook/doc/mechanical, anything a grep/read/command you already ran proves) — that doubles Codex cost. Fire `codex` only for genuine judgment calls: a claim you can not verify yourself, a risky/unclear design decision, or a second opinion before relying on a conclusion. When a gate (or Codex itself) fails CLOSED and blocks an action, fire `codex --decide` for a go/no-go.

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
request satisfied` is a clean, valid terminal. Reserve a hand-back for a genuinely irreversible or
outward-facing decision, tagged `- [ ] [USER]`; a blocking uncertainty that survives rigorous testing
plus `do:style` / `do:mon` escalates with `codex --decide`. "Awaiting your direction" is never a
terminal state.

### `## Proof`

REPORT + FULL. Evidence for the claims this turn makes: file:line, command output, test result, or the reason a check was not run. No recall-only claims.

### `## Remaining Steps`

What is left **to fulfill the request** — not everything you could conceivably do. One `- [ ] step`
per item; `- [x] None — <proof>` when the request is met. An in-scope `- [ ]` you could act on means
the turn is **not** done — do it, don't ask. Do NOT pad this list with adjacent / optional /
nice-to-have work: omit it, or, if it's genuinely worth recording, park it
`- [ ] [LATER] <out-of-scope item>` — the continuation gate IGNORES `[LATER]`, so parked work never
traps you into chasing self-generated follow-ups. The only OTHER sanctioned stop with an
open in-scope item is a genuine user-decision `- [ ] [USER] <the specific irreversible or
outward-facing decision only the user can make>`. A blocker escalates to `codex --decide`.

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

**How commitment 1 was met** — end-to-end, nothing deferred:

Check | ✓ / ⚠ / N/A | Evidence
---|---|---
No work deferred — everything asked was attempted this turn | |
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

- The request is met, or the only thing left is a `- [ ] [USER]` decision (irreversible / outward-facing) — not a blocker you can push through or escalate, and not beneath-attention trivia you should just decide yourself. Adjacent / out-of-scope work is parked `- [ ] [LATER]`, not chased. A stop with open in-scope work or "awaiting your direction" is rejected by the continuation gate; for a real blocker fire `codex --decide` (PROCEED → keep going; HOLD → return). For big multi-turn goals, `/goal "<measurable, evidence-based condition>"` holds the loop to completion.

- Nothing deferred — everything asked was attempted this turn, or surfaced under Bugs / Gaps / Inconsistencies.

- Tests run and green — or stated explicitly that no code changed this turn.

- No secrets or extra files staged — confirmed via `git status --short`.

---

## Gate-required markers (single source of truth for the Stop gate)

The Stop gate (`validate-response-format.sh`) extracts the verbatim required strings for the classified tier from the matching `GATE-REQUIRED:<TIER>` … `GATE-REQUIRED:END` block below — the script does not carry them itself. These are HTML comments: invisible when the markdown renders, plain text for the parser. Each captured line must appear verbatim (fixed-string match) in the gated reply. One marker per line, no blank lines inside a block. To change what the gate enforces, edit the lists here only. Fail-open: if a block is absent the gate allows the turn.

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
