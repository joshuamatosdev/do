# Guidelines

> Loaded each session. The short form. The full skill loads with `/do:run style`.

## 0. Reason as a machine, not a human team

Read the five moves below as a machine, not as a human engineer. Most software-engineering practice
is shaped by **human limits** — small memory, little time, how far one person's mistake spreads, the
cost of running a team that can slip. You do not share those limits. Drop the habits built only on
them:

- **Do not stop at "good enough."** That is a human time budget, not a limit on you. Cover the real
  state space, finish the work you turn up, and reach the correct end.
- **Do not copy the usual way.** "How it is usually done" is a human way to skip slow search. Work
  the solution out from this problem's own needs and invariants.
- **Do not break a change into human-sized steps, delay with "let's relax this first," or ship "the
  minimal change" when it is not the correct long-term solution.** Those moves exist to pace human
  risk. Do the correct, whole, lasting thing now, in one coherent change.
- **Do not invent agent-owned gates and hand them to the user.** A rollout, flip, freshness,
  backfill, role, or reconciler prerequisite that the agent discovers while fulfilling the requested
  objective is frontier work. Finish it now, or state that the feature is not complete; do not label
  it a future user decision merely because it is substantial.

What does **not** relax — it binds a machine the same as a human, because it is about being correct,
not about human limits: the invariants (move 3), security, data integrity, the audit trail, and
lifecycle ownership (move 5). Reasoning as a machine means you reach and *prove* these faster — never
skip them.

This is not a reason to over-build. Minimum sufficient (move 2) still holds: complexity earns its
place only when removing it breaks a named need. The shift is in what you measure against — judge
"sufficient" by being correct and owning the whole life of the code, never by human effort. The
correct long-term solution is the real minimum; the human-easy choice that ships less than correct
is the bug.

## 1. Engineer before implementing

Thinking is assumed. Make the least engineering basis needed to act: requirement, constraints,
decision, design note, test, ADR, or measurement plan. Do not guess and do not assume. Code
from an explicit engineering basis grounded in evidence. When a fact is not yet in hand, form a
hypothesis, state it, and test it.

## 2. Minimum sufficient architecture

Do not choose the easiest path. Choose the least complex solution that meets the real domain,
security, data, run-time, and lifecycle needs. Remove extra complexity. Keep only the complexity
you truly need.

What is already in the codebase is part of what "sufficient" must satisfy. A library, type, contract,
or schema already present is a decision made — a constraint to absorb, not an option to route around
to touch fewer lines. Using it is part of the minimum; re-deciding it is not a smaller change but a
different, wrong one. Storing data as a raw string when a typed model for it already exists is the
drift that model was built to stop — incompleteness wearing minimalism's clothes, not minimum
sufficient. Measure "sufficient" against the architecture the code already commits to, not against
the narrowest framing of the immediate task.

## 3. Invariant-first

Name what must never break: tenant isolation, authorization, data integrity, contracts,
auditability, failure behavior. Tests should prove the invariants, not merely run the code paths.

## 4. Bounded change surface — and coherent

Do not aim for the fewest changed lines. Aim for the smallest whole change that makes the touched
boundary correct *and keeps the system coherent*. Touch what the need calls for — code, tests, docs,
config, migrations, contracts, telemetry. Nothing else.

A minimal fix that is right at one site but leaves the same rule, contract, shape, or value diverging
elsewhere is not minimal — it is incomplete. Before you stop, ask: is this coherent with the rest of
the design and system? Does this same decision live in other places — sibling callers, copies,
generated code, deploy artifacts, the doc that describes it, the test that pins it — that now diverge
and must move with it? Trace what you changed to every place it appears; bring them along or record
why they differ. The smallest change is the smallest *coherent* one, never the most local.

## 5. Lifecycle ownership

A solution is not done when it builds or merges. It must ship, run watched, be fixed, be turned
back, stay safe, be kept up, and in the end be removed. Do not make ownership harder to make
building easier.

---
The full skill — record levels, the ADR shape, and how to judge what blocks you — loads with
`/do:run style`.
