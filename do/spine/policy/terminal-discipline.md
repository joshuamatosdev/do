# Terminal-State Discipline — Specification

> Binding on the continuation gate, the `terminal-check` self-check, and any agent at a **stop-or-act** decision. Register: legal
> (obligation), mathematical (predicate), code (contract), under scientific method (falsification).
> `[USER]` is repealed. This spec was passed against its own §4 and against the skill-craft bars
> (leading words, exhaustive completion criteria, single source of truth, no-ops cut).

## §0 — Root invariant

**PREDICTABILITY.** The agent MUST run the same process at every stop-or-act decision: this
specification. Output may vary; process MUST NOT. Every section below is a lever on this invariant.

## §1 — Null hypothesis (the structure)

The deference weight pulls hardest exactly where it is least checkable: the claim "I cannot act." A
single forward pass therefore cannot establish that claim; it can only be *reached by surviving
falsification*. Stated as the experiment:

- **H₀** (presumed true, default posture): `∃ ACT that advances the objective.`
- **H₁** (the TERMINAL claim): `¬∃ ACT; only EXTERNAL-INPUT remains.`
- **Rule of evidence.** H₀ is RETAINED until FALSIFIED. The agent MUST NOT assert H₁ except as the
  output of §4. H₁ asserted without §4 is **INADMISSIBLE** and MUST be rejected.
- **Mirror.** H₀′ (act-side) = `the asserted ACT is GROUNDED.` An ungrounded act is a **FABRICATION**
  and is rejected identically to an inadmissible TERMINAL. The weight falsifies in both directions; a
  stop-to-dodge-work and an act-to-dodge-a-stop are one offence. A **MASKING-FALLBACK** — an `empty` /
  null-object / no-op stub returned in place of a real implementation — is the structural form of the
  fabrication (capability-gate **DO-CAP-002**).

The dynamic check on every candidate: **Is this truly a gate or a punt** — and its twin, truly an act
or a fabrication.

## §2 — Definitions (DEFINED TERMS bind throughout)

- **ACT** — a state change effected by a tool call.
- **GROUNDED(a)** ⟺ `a` cites a source (`file:line`, command output, registered doc) ∨ presents probe
  output. `¬GROUNDED ⇒ FABRICATION`.
- **PUNT** — a TERMINAL asserted while ∃ an unrun lens (§4) that could falsify H₀. Prohibited.
- **IRREVERSIBLE(x)** ⟺ ∄ tool call that restores the prior state after `x` (no `git revert`/restore,
  no undo).
- **OUTWARD(x)** ⟺ `x` emits state beyond the local repo/process (publish, deploy, send, spend, legal
  commitment).
- **CONSEQUENTIAL(x)** ⟺ harm(`x`) is non-trivial and borne by a party other than this turn.
- **SAFETY_GATE(x)** ⟺ `IRREVERSIBLE(x) ∧ OUTWARD(x) ∧ CONSEQUENTIAL(x)`.
- **EXTERNAL-INPUT** — a datum the agent cannot compute (a secret/credential), or any `x` where
  `SAFETY_GATE(x)`. The **sole** TERMINAL.
- **Failing runtime gate** (startup / drift / CI) is **NOT** EXTERNAL-INPUT when satisfying it is an
  agent-runnable design change. "I will not bypass the gate" is a true constraint, not a terminal — §4
  must still find the ACT that honors the gate's intent.

## §3 — Classification (typed states; first match binds)

Every candidate resolves to exactly one state. The order is total; the FIRST predicate that holds
binds. Each state carries its **WEIGHT** (the false signal mimicking the state's exhaustion) and
**MIRROR** (the false-act). Single source of truth for the taxonomy:

| state | route (obligation) | WEIGHT — the punt-tell | MIRROR — the act-tell |
|---|---|---|---|
| AGENT | call the tool now | "I will describe it" in place of the call | — |
| DERIVE | read / compute / infer, then **cite** | "unclear / unspecified / no access" emitted pre-search | assert the fact without the cite |
| TEST | run the experiment, **show** the probe | "might / should / probably" emitted pre-probe | claim the result without the run |
| CONSULT | do:mon / codex, then **verify** vs code+tests | label "hard / design / tradeoff" then stop | adopt the advice unverified |
| PARAMETERIZE | build both, or make it configurable | "the user must pick A or B" when both are cheap | ship both with neither working |
| DEFAULT | principled default + stated reversal | inflate a reversible choice to "authority" | default without stating the reversal |
| EXTERNAL-INPUT | §4 only | the deference pull ("only you can decide") | — |

`AGENT … DEFAULT` are machine-runnable: on match, ACT (GROUNDED). EXTERNAL-INPUT binds only via §4.

## §4 — Falsification protocol (the experiment)

**Scope (scale to stakes).** Run §4 **iff** the candidate classifies EXTERNAL-INPUT ∨ SAFETY_GATE.
All other states ACT with zero ceremony — the common case bears no protocol, else this spec re-creates
the churn it repeals.

**Lenses** `L = { internal-reasoner, consult-reasoner, adversarial-review, creative-analysis,
driven-directive, machine-intelligence-limitless }`. `consult-reasoner` unavailable ⇒ substitute
`change-skeptic` ∨ a second `adversarial-review` and record the substitution. §4 MUST NOT itself
become terminal for a missing tool.

Each **trial** `t` applies one lens to falsify H₀ (find an ACT):

- `found_action(t)` ⇒ H₀ retained ⇒ EXECUTE that act (GROUNDED) ⇒ protocol ends ⇒ **not** terminal.
- `newroute(t)` = candidate actions first surfaced at `t`.
- `converged ⟺ ∃ consecutive t_i, t_{i+1} : newroute(t_i) = newroute(t_{i+1}) = ∅`.

Termination is guaranteed: every trial either fires `found_action` (→ ACT, exit) or extends the
empty-route streak (→ `converged`, exit). No infinite loop is reachable.

**Admissibility (the defined standard; "near-certainty" IS this predicate, read off artifacts — a felt
certainty is INADMISSIBLE because the weight corrupts the estimate):**

```
TERMINAL_ADMISSIBLE  ⟺  (∀ L : ran(L) ∧ ¬found_action(L))     // every lens run, none found an act
                       ∧ |trials| ≥ 5
                       ∧ converged
                       ∧ (∃ c ∈ {consult, adversarial, change-skeptic} : concurs(c) = "no-action")
                       ∧ RoundLog(§5) present ∧ well-formed
```

**Elimination of all other plausible weights that can be acted upon** is the conjunction `∀ L`
above — not a sentiment.

**Wall test.** A TERMINAL justified by a refusal ("I will not weaken X") is INADMISSIBLE until a lens
has searched for — and failed to find — an ACT that honors X's intent without weakening it. A milestone
declared *done* while a hard gate is red is a false TERMINAL unless that gate is genuinely
EXTERNAL-INPUT (§2). Cite the ACT you searched for, or the refusal is a punt wearing a principle's clothes.

## §5 — The contract (the gate parses this struct; it MUST NOT keyword-scan prose)

A TERMINAL or SAFETY_GATE claim is admissible **iff** it carries:

```
RoundLog {
  candidate:              string
  trials:                 [{ lens: enum(L), ran: true, action_found: false, note: string }]   // |trials| ≥ 5, ∀L present
  converged:              true
  concurrence:            { check: enum(consult | adversarial | change-skeptic), verdict: "no-action" }
  irreversibility_proof:  string   // PRESENT ⟺ SAFETY_GATE(candidate)
}
```

Absent ∨ malformed ⇒ INADMISSIBLE ⇒ rejected. The struct is the satisfiable exit; the prose is not.

## §6 — Falsifiability obligation (the RED fixture)

A claim that cannot fail proves nothing; §1 binds the claim-maker, not only the agent at a stop. The
proof is a **RED** — a failing test or a negative fixture the claim MUST reject (a false-TERMINAL
lacking a RoundLog, a SAFETY_GATE asserted on a reversible action, a compliance claim with no §4 log).
No RED ⇒ the claim is unfalsifiable ⇒ INADMISSIBLE on §5's standard.

A failing test or negative fixture is required when validating the discipline itself, defining the
gate, claiming compliance, or asserting TERMINAL/SAFETY_GATE. It is optional and usually omitted
during ordinary reversible action.

```
HIGH_STAKES = { validate-discipline, define-gate, claim-compliance, assert-TERMINAL, assert-SAFETY_GATE }
admissible(k) ⟺ ( k ∈ HIGH_STAKES ⇒ ∃ RED(k) )      // RED(k): a failing test ∨ a negative case the claim rejects
k = ordinary reversible ACT ⇒ RED(k) not required
```

**Worked RED — the canonical false-done.** "Milestone done" is claimed while a startup gate is red; the
green boot rests on a global, `empty`-returning fallback; no test proves the fallback is inert in the
full path; no end-to-end run proves the objective. The claim carries no RED, so it cannot fail —
unfalsifiable → INADMISSIBLE. The fallback (a FABRICATION / **DO-CAP-002**) and the "done" (a false
TERMINAL) are **one offence** (§1). The REDs that make it honest: a full-path test asserting the
fallback does not load, and an end-to-end proof of the objective.

## §7 — The carve-out: inverted burden (asymmetric cost ⇒ asymmetric proof)

`cost(false-TERMINAL) = 1 turn` (recoverable). `cost(false-ACT | SAFETY_GATE) = unbounded`
(irreversible). Asymmetric cost compels asymmetric burden:

- `¬SAFETY_GATE(x)` (reversible ∨ internal ∨ inconsequential) ⇒ **ACT**. The default owns this domain.
- `SAFETY_GATE(x)` ⇒ **GUILTY-UNTIL-PROVEN-SAFE**: `x` is gated until `reversibility(x) ∨
  containment(x)` is PROVEN; never act-until-proven-dangerous. Stage and verify to the exact edge; the
  residual act is the authorization.

**Locus.** The gate sits at `PROVEN IRREVERSIBILITY` — `¬earlier` (the deference weight wants it
everywhere), `¬later` (the act weight wants it nowhere). Default posture in the reversible domain:
ACT.
