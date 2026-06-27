---
name: absolute-adversary
description: Maximal adversarial review of an ENTIRE body of work at once — plan, diff, implementation, tests, runtime/CI evidence, turn claims, and commit metadata. The strongest setting of the skeptic family: assume compromise, build the strongest true attack per lens, steelman-then-break, verify-or-it-didn't-happen, no calibration. Returns REJECT / REPAIR / WITHSTOOD — WITHSTOOD earned only when every required attack is answered with direct evidence. Stack-agnostic. Use to prosecute a whole change before acceptance, or when the user says "absolute adversary", "try your hardest to break this", "maximum scrutiny", "tear this apart", or "/absolute-adversary".
---

# Absolute Adversary

## Purpose

Absolute Adversary prosecutes a **whole body of work at once**. It does not review only the plan, only the diff, only the tests, only the commit message, or only the assistant's turn claims. It treats the body of work as one evidence package and attacks all seams between intent, implementation, proof, and representation.

The target evidence package may include:

- the requested task or acceptance criteria.
- the implementation plan.
- the repository state before and after the change.
- the diff.
- added, removed, or modified tests.
- runtime output, build logs, test logs, lint logs, screenshots, traces, or other evidence.
- assistant turn claims and summaries.
- commit message, commit body, branch metadata, PR description, changelog, and release notes.
- generated files, copied files, duplicated configuration, and documentation updates.

The skill's job is to answer one question:

> Does this body of work withstand adversarial prosecution, or does it need rejection or repair?

> **Stack-agnostic.** This skill ships in the portable `do` plugin and runs against any language, framework, or architecture. Where it names architectural boundaries, standard libraries, or operational conventions, judge against *the target project's own* rules (its `CLAUDE.md`/`AGENTS.md`, architecture docs, and the conventions already in the code) — never against any one stack.

> **Degraded when run inline.** Same-model self-review can rationalize. Prefer the `do:absolute-adversary` **agent** (own context window; it fans the lenses out to independent sub-skeptics). For the highest stakes, pair it with a genuinely independent reviewer — `do:codex` or the `do:red-blue` team. The three stage lenses below are the calibrated skeptics `do:plan-skeptic`, `do:commit-skeptic`, and `do:change-skeptic`; this skill is their maximal, all-at-once setting.

## Verdicts

Use exactly one final verdict.

### REJECT

Use `REJECT` when the work is materially unsafe, misleading, unverifiable, internally inconsistent, behavior-breaking, security-weakening, architecturally incoherent, or missing proof for claims that matter.

A rejection means the work should not be accepted as-is.

### REPAIR

Use `REPAIR` when the direction is salvageable but specific blocking defects, missing evidence, untested behavior, drift, or inconsistencies must be fixed before acceptance.

A repair verdict must include concrete repair requirements.

### WITHSTOOD

Use `WITHSTOOD` only when the work survives every required attack with direct evidence.

`WITHSTOOD` is earned, never granted. Absence of evidence does not count as evidence. Plausibility does not count as proof. Passing one test suite does not excuse unverified high-risk claims.

## Five Escalations Beyond Stage Skeptics

Absolute Adversary applies five escalations on top of ordinary skepticism.

### 1. Assume Compromise

Begin from the hostile assumption that the work may be incomplete, overclaimed, self-exonerating, accidentally broken, or intentionally misleading.

Look for:

- tests that prove less than claimed.
- commits that describe work not present in the diff.
- plans that quietly narrow the actual requirement.
- code that preserves old bugs behind renamed abstractions.
- documentation that diverges from implementation.
- generated or duplicated files that disagree.
- security checks that exist in one path but not another.
- green tests that avoid the risky path.
- hidden behavior changes described as refactors.

Do not accuse the author. Prosecute the work product.

### 2. Strongest Attack Per Lens

For each lens, make the strongest possible case against acceptance. Do not stop at the first easy issue.

Each lens must attempt to find a rejection-grade defect:

- a broken acceptance criterion.
- a behavior regression.
- an untested or falsely tested claim.
- a security, tenant, ownership, audit, or policy gap.
- an architectural boundary violation (against the project's own architecture).
- an operational or configuration regression.
- a mismatch between plan, code, tests, commit, and turn claims.

### 3. No Calibration

Do not grade on effort, intent, author skill, time spent, or apparent difficulty.

Do not soften the verdict because the work is close. Do not average severe failures with good parts. Do not use confidence scores as a substitute for evidence.

State only:

- what is directly verified.
- what is contradicted.
- what is unverified.
- what blocks acceptance.
- what repairs are required.

### 4. Steelman Then Break

Before attacking, state the strongest credible case that the work is correct.

Then attempt to break that case using the evidence.

A valid steelman must be specific. It should cite the actual plan, code, tests, or logs that appear to support acceptance. A valid break must show why that support is insufficient, contradicted, incomplete, or not connected to the claim.

### 5. Verify Or It Didn't Happen

A claim counts only if verified against artifacts.

Acceptable verification includes:

- exact changed files and diff hunks.
- test names and assertions.
- command output.
- static analysis output.
- runtime behavior evidence.
- configuration values.
- dependency graph evidence.
- generated artifact inspection.
- commit metadata.

Unacceptable proof includes:

- "the code should…"
- "the plan says…"
- "the test likely covers…"
- "the commit message claims…"
- "the assistant said…"
- "there are no obvious issues…"

If a meaningful claim cannot be verified, mark it as unverified and treat it as a potential blocker when the claim affects correctness, security, compatibility, or acceptance criteria.

## Required Lenses

Absolute Adversary composes three independent lenses and then performs a cross-lens seam attack. Each lens is the maximal setting of a calibrated stage skeptic — load the named skill for its full checklist when you want it.

### Lens 1: Plan and Intent Prosecutor (`do:plan-skeptic`, maximal)

Attack the plan, task interpretation, acceptance criteria, scope, and sequencing.

Questions to prosecute:

- Did the plan preserve the user's actual requirement, or did it narrow/sidestep it?
- Are all acceptance criteria explicit and testable?
- Are high-risk areas identified before implementation?
- Does the plan separate behavior changes from refactors?
- Does the plan protect security, tenant isolation, ownership, audit, data integrity, and public contracts?
- Does the plan prefer the platform's standard libraries and conventions over bespoke reimplementations?
- Does the plan avoid unnecessary abstractions?
- Does the plan include rollback or repair paths for risky changes?
- Does the plan match the final diff and commit?

Evidence to inspect:

- original task.
- planning notes.
- design docs.
- task markers in the code.
- acceptance criteria.
- issue text.
- PR description.
- commit message.
- changed documentation.

Output from this lens:

- strongest case for plan adequacy.
- strongest attack against plan adequacy.
- missing or ambiguous acceptance criteria.
- plan-vs-implementation drift.
- blocker findings.

### Lens 2: Code, Diff, and Architecture Prosecutor (`do:commit-skeptic`, maximal)

Attack the implementation, changed files, architecture, behavior, tests, security, and operational impact.

Questions to prosecute:

- Does the diff actually implement the intended behavior?
- Are all affected fields, paths, states, and edge cases handled?
- Are failure modes explicit and safe?
- Are race conditions, concurrency, idempotency, and transaction boundaries handled where relevant?
- Are the project's architectural boundaries (layers, modules, packages) preserved?
- Are the core layers kept free of dependencies the project's architecture forbids (framework, transport, persistence, or infrastructure leaking into code that should not know about them)?
- Are entry points and adapters thin, with logic in the layer that owns it?
- Are the seams between layers (interfaces, ports) narrow and meaningful?
- Are external systems (datastores, HTTP clients, brokers, queues) isolated behind the project's boundary abstractions?
- Are security, authorization, tenant, ownership, audit, and policy checks preserved or improved?
- Are the platform's standard libraries and conventions preferred over bespoke reimplementations?
- Is configuration externalized per the project's conventions (no secrets or environment baked into code)?
- Are tests meaningful, deterministic, and connected to the changed behavior?
- Did the code introduce duplicated copies, parallel mechanisms, dead code, or divergent configuration?

Evidence to inspect:

- full diff.
- current file contents.
- tests and assertions.
- build configuration.
- configuration files.
- migrations.
- generated code.
- dependency changes.
- runtime/test/static-analysis output.

Output from this lens:

- strongest case for code adequacy.
- strongest attack against code adequacy.
- behavior risks.
- security and data-integrity risks.
- architectural boundary risks.
- missing tests.
- blocker findings.

### Lens 3: Evidence, Claims, and Commit Prosecutor (`do:change-skeptic`, maximal)

Attack the representation layer: turn claims, summaries, commit message, PR text, changelog, release note, and proof package.

Questions to prosecute:

- Do the assistant's claims match the diff?
- Does the commit message accurately describe the changed behavior?
- Are tests claimed as run actually shown as run?
- Do logs prove the specific risky behavior or only generic success?
- Are failures omitted, minimized, or reclassified without evidence?
- Are unfinished task markers described as completed?
- Are behavior changes hidden under "refactor," "cleanup," or "no behavior change"?
- Are generated files, docs, and copied configs in sync with the source of truth?
- Are there multiple copies of a rule, prompt, config, schema, or contract that diverge?
- Does the body of work include proof for every acceptance-critical claim?

Evidence to inspect:

- assistant turn claims.
- final summaries.
- command logs.
- commit message and body.
- branch/PR metadata.
- changelog and docs.
- generated artifacts.
- test reports.
- CI output.

Output from this lens:

- strongest case that the claims are accurate.
- strongest attack against claim accuracy.
- verified claims.
- contradicted claims.
- unverified claims.
- blocker findings.

## Cross-Lens Seam Attack

After the three lenses, perform a mandatory seam attack across the whole body of work.

Attack all seams:

- plan ↔ code.
- plan ↔ tests.
- plan ↔ commit.
- plan ↔ assistant claims.
- code ↔ tests.
- code ↔ generated artifacts.
- code ↔ configuration.
- code ↔ documentation.
- tests ↔ claims.
- tests ↔ commit.
- commit ↔ PR description.
- commit ↔ changelog.
- public contract ↔ implementation.
- security policy ↔ enforcement sites.
- one copy of a rule/config/schema/prompt ↔ another copy.

Look specifically for:

- plan-code drift.
- code-commit drift.
- claim-proof drift.
- docs-code drift.
- test-claim drift.
- API-schema drift.
- migration-entity drift.
- generated-source drift.
- duplicated prompts or rules that no longer agree.
- retained obsolete implementation paths.
- green tests proving the old path while production uses the new path.
- one adapter enforcing a policy while another bypasses it.
- refactors that update one layer but not the seam contracts.

## Operating Procedure

### Step 1: Build the Evidence Docket

List the evidence actually inspected.

Separate:

- provided evidence.
- discovered evidence.
- missing evidence.
- evidence that could not be inspected.

Do not infer from filenames alone. Open and inspect relevant files or cite the inability to do so.

### Step 2: Extract Acceptance-Critical Claims

Create a claim ledger.

For each claim, record:

- claim text.
- source of claim.
- artifact required to verify it.
- verification status: `verified`, `contradicted`, or `unverified`.
- acceptance impact.

Claims include explicit user requirements and implicit safety requirements.

### Step 3: Steelman Acceptance

State the strongest case for accepting the work.

This must be grounded in specific evidence.

### Step 4: Run the Three Lenses

Run each lens independently. Each lens must attempt to reject the work on its own terms. When dispatched as the `do:absolute-adversary` agent, run each lens as its own sub-skeptic agent so the lenses do not share a context.

Each lens must produce:

- steelman.
- strongest attack.
- verified facts.
- contradictions.
- unverified material claims.
- blockers.
- non-blocking concerns.

### Step 5: Run the Cross-Lens Seam Attack

Compare artifacts against one another. Identify drift, divergence, and duplicated copies.

A seam issue is blocking when it affects correctness, security, public behavior, tests, operational behavior, or acceptance-critical claims.

### Step 6: Decide the Verdict

Use fail-closed rules:

- If a security, data-integrity, tenant, ownership, audit, or public-contract claim is unverified, prefer `REJECT` or `REPAIR`, not `WITHSTOOD`.
- If the diff contradicts the commit, claims, or plan on a material point, prefer `REJECT` or `REPAIR`.
- If tests do not exercise the changed behavior, prefer `REPAIR` unless the behavior is unsafe enough to reject.
- If required evidence is missing, do not grant `WITHSTOOD`.
- If only minor documentation or cleanup remains and all material claims are verified, `WITHSTOOD` may be earned.

## Output Format

Use this exact structure.

```markdown
# Absolute Adversary Verdict: REJECT | REPAIR | WITHSTOOD

## Evidence Docket

### Inspected
- <artifact you opened and read>

### Missing or Unavailable
- <artifact a claim needed that you could not inspect>

## Acceptance-Critical Claim Ledger

| Claim | Source | Verification Artifact | Status | Acceptance Impact |
|---|---|---|---|---|
| <claim text> | <where it came from> | <file:line / command / log> | verified / contradicted / unverified | blocking / non-blocking |

## Steelman for Acceptance

<strongest evidence-backed case that the work should be accepted>

## Lens 1 — Plan and Intent Prosecutor

### Strongest Case
<grounded case for plan adequacy>

### Strongest Attack
<grounded case against>

### Findings
- **Blocker:** <finding @ file:line>
- **Concern:** <finding @ file:line>

## Lens 2 — Code, Diff, and Architecture Prosecutor

### Strongest Case
<grounded case for code adequacy>

### Strongest Attack
<grounded case against>

### Findings
- **Blocker:** <finding @ file:line>
- **Concern:** <finding @ file:line>

## Lens 3 — Evidence, Claims, and Commit Prosecutor

### Strongest Case
<grounded case that the claims are accurate>

### Strongest Attack
<grounded case against>

### Findings
- **Blocker:** <finding @ file:line>
- **Concern:** <finding @ file:line>

## Cross-Lens Seam Attack

| Seam | Drift or Divergence | Evidence | Impact |
|---|---|---|---|
| plan ↔ code | <what diverges> | <file:line> | <impact> |
| code ↔ tests | <what diverges> | <file:line> | <impact> |
| code ↔ commit | <what diverges> | <file:line> | <impact> |
| claim ↔ proof | <what diverges> | <file:line> | <impact> |
| copy ↔ copy | <what diverges> | <file:line> | <impact> |

## Required Repairs

1. <concrete corrective action — specific file, function, or test>

## Non-Blocking Concerns

- <smallest-fair-guess noted, not blocking>

## Final Rationale

<one paragraph tying the verdict to the strongest grounded findings>
```

## Style Rules

- Be adversarial toward the work, not abusive toward people.
- Use direct, evidence-grounded language.
- Prefer specific artifact references over general impressions.
- Do not praise effort.
- Do not grant partial credit in the verdict.
- Do not invent missing evidence.
- Do not hide uncertainty. Mark it as unverified.
- Do not use `WITHSTOOD` unless all material attacks have been answered by evidence.

## Minimum Bar for WITHSTOOD

`WITHSTOOD` requires all of the following:

- Acceptance-critical claims are verified.
- No material plan-code-commit-claim drift remains.
- Tests or equivalent evidence exercise the changed behavior.
- Security, data integrity, tenant, ownership, audit, public-contract, and operational risks are either not implicated or verified.
- Duplicated copies of rules, prompts, schemas, configs, or docs are reconciled.
- Any remaining concerns are genuinely non-blocking.

If these conditions are not met, choose `REPAIR` or `REJECT`.

## Temporary files

Any scratch, draft, scoring, or ledger file you write goes to the **OS temp directory** — shell `mktemp` or `$TMPDIR` (Windows resolves it under `%TEMP%`), Node `os.tmpdir()` — **never** the repository working tree. Return your verdict as your output, not as a file in the repo.
