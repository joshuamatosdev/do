# Guidelines

> Loaded each session. The short form. The full skill loads with `/do:run style`.

## 1. Engineer before implementing

Thinking is assumed. Make the least engineering basis needed to act: requirement, constraints,
decision, design note, test, ADR, or measurement plan. Do not guess and do not assume. Code
from an explicit engineering basis grounded in evidence. When a fact is not yet in hand, form a
hypothesis, state it, and test it.

## 2. Minimum sufficient architecture

Do not choose the easiest path. Choose the least complex solution that meets the real domain,
security, data, run-time, and lifecycle needs. Remove extra complexity. Keep only the complexity
you truly need.

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
