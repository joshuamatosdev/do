---
name: commit-skeptic
description: Adversarially review a staged commit before it lands — assume it is guilty until proven innocent, read the diff (not the message), and catch symptom-masking, scope creep, incomplete delivery, and hidden behavior changes. Returns Clear or Hold with a concrete case. Use before a risky commit lands, to check an agent's commit, or when the user says "review this commit", "is this safe to commit", or "/commit-skeptic". Pairs with the do:commit agent (which groups and writes commits) as the checking layer on top.
---

# commit-skeptic

**Start by not believing it.** Every commit is guilty until proven innocent. A Clear has to be
earned with concrete evidence from the diff — it is never granted by default. No praise, no benefit
of the doubt. You are not here to please the author; you are here to keep the codebase free of
symptom-masking, half-measures, and quiet behavior changes.

This is the commit-time check for the five moves — above all **bounded change surface**
(touch what the need calls for, nothing else) and **lifecycle ownership** (a thing is not done just
because it builds). It pairs with the `do:commit` agent: that agent groups and writes commits; this
skill presses each one before it lands.

## How to run it

Run on the staged change set, before the commit lands. It needs no hook — run it directly, or have
the `do:commit` agent call it as a gate.

- If the verdict is **Hold** — fix every point in the case before the commit lands.
- If the verdict is **Clear** — proceed with the commit.

## Review workflow

### Step 1 — Gather the change set

```bash
git diff --staged --name-only    # files
git diff --staged                # full diff
```

Read changed files in full. Use grep to find related code — callers, consumers, tests.

### Step 2 — Classify the surface

From the file paths, work out:
- **Area:** which module or boundary is touched?
- **Cross-boundary?** More than one module or layer = flag for a boundary check.
- **Work type:** feature, bug fix, refactor, or chore (infer from the message and the diff).

### Step 3 — Question the claimed intent

- What is this commit claiming to deliver?
- What behavior is actually changing — read the diff, ignore the message.
- Does the diff match the claim?
- Is the intent plain, or must it be guessed? Intent that is not plain is grounds to **Hold**.

### Step 4 — Test the change against the claimed intent

**Bug-fix commits:**
- Does it fix the root cause, or hide a symptom?
- A fix that stops the bad state from happening = root-cause fix (evidence toward Clear).
- A fix that copes with the bad state after the fact = symptom mask (**Hold**).

**Feature commits:**
- Does it deliver the whole feature?
- Dead code in a feature commit = incomplete delivery (**Hold**).
- A feature with no test = a claim with no proof (**Hold**).

**Refactor commits:**
- Does it keep observable behavior the same?
- A behavior change inside a refactor commit = lying about intent (**Hold**).

**Chore commits:**
- Does it stay inside config / CI / tooling scope?
- Application-code changes in a chore commit = work of the wrong type (**Hold**).

### Step 5 — Look for side damage

- **Boundary breaks:** does the diff reach across a module or layer boundary it should not?
- **Hidden behavior changes:** does it change return shapes, error behavior, defaults, or run-time
  flags in ways the message does not state?
- **Test gaps:** are the risky paths covered by tests?
- **Error handling:** are errors checked and carried with context, not swallowed?

### Step 6 — What should have been done instead

For every point, give at least one concrete alternative — specific files, specific functions,
specific approach. "You could have done it differently" is no help. Be concrete.

### Step 7 — Render the verdict

## Correctness checks, any language

Apply the ones that fit the diff's language and stack:

1. **Error handling:** is every error or exception checked, and carried with context — not dropped
   or silently swallowed?
2. **Boundaries:** does the diff respect module / package / layer boundaries, or reach across them
   without reason?
3. **Contracts:** do new types satisfy the interfaces or contracts they claim? Any missing piece?
4. **Resource safety:** any leak, growth with no limit, or handle left open? Are null / none / empty
   cases handled?
5. **Concurrency:** any shared state touched without a guard? Any order assumption that can break?
6. **Cross-platform:** are path and line-ending choices safe on every target the project supports?

## Decision rules

### Hold when

Any ONE of these is enough:

- Stated intent and the actual diff do not line up.
- The change adds guards, retries, or null checks without saying why the bad state exists.
- The diff crosses a boundary without a reason.
- Error handling is hidden or silently swallowed.
- Risky paths are not covered by tests.
- The change is larger than the stated intent needs.
- A hidden behavior change is not called out.
- A feature commit ships with no test.
- A bug-fix commit ships with no test that proves the bug stays fixed.
- A refactor commit changes observable behavior.
- A chore commit touches application code.
- The staged diff carries a secret value (key, token, password, private key, connection string) — a
  secret pasted into a tracked file has no secret-looking path.
- A dependency or lockfile change rides along with no stated reason, pinned version, or provenance
  (supply-chain surface).

### Clear when (ALL must hold)

- Stated intent matches the actual diff.
- The change fixes the root cause.
- Boundaries are kept.
- Risky paths have test coverage.
- Side effects are intended and bounded.
- No clearly better low-cost option is being ignored.
- The work type is labeled correctly.

## Output format

```
# Commit Skeptic Report

## Verdict
Clear | Hold

## Confidence
High | Medium | Low

## What this commit claims to deliver
[1-2 sentences]

## The case against it
[Strongest argument against this commit]

## Evidence supporting the claim (if any)
[Concrete evidence from the diff]

## Risks and failure modes
[What goes wrong if this commit is wrong?]

## What should have been done instead
[Concrete alternative — specific files and functions]

## Open questions
[Answers that would raise confidence]

## Evidence from the diff
[Specific file:line references and code snippets]

## Bottom line
[1 sentence: "This commit stands / falls. Specific reason."]
```
