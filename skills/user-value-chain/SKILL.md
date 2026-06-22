---
name: user-value-chain
description: Close the last mile from a working capability to real user value. Use when a feature works in the code but no one can use it yet — no one can find it, run it, tell it succeeded, recover from its errors, or operate it, and the docs are missing. Walk discovery, invocation, success signal, error recovery, observability, and docs, then close every gap before the feature is called done. Triggers on "is this actually done", "ship the last mile", "finish this feature for users", or "/user-value-chain".
---

# user-value-chain

A feature that runs is not the same as a feature that delivers. This skill closes the last mile from
a working run-time capability to real user value.

It is the working form of the fifth move — **lifecycle ownership**: a solution is not
done when it builds or merges; it has to ship, run watched, be recovered from when it breaks, and be
operated. Use it when the code works but no one can yet find, use, trust, or support the feature.

## The questions to answer

- **Discovery:** how does the user find out the feature exists?
- **Invocation:** how do they run it — the exact entry point, command, or path?
- **Success signal:** what output proves it worked?
- **Error recovery:** which errors can the user recover from on their own, and how?
- **Observability:** what does an operator need to debug it when it breaks?
- **Docs gap:** what docs, examples, and release notes are still missing?

A feature with no answer to one of these is not done — name the gap and close it.

## Procedure

1. Define the primary user journey, end to end.
2. Define the setup, invocation, and success-check steps.
3. Define the failure modes and the recovery guidance for each.
4. Define the observability and support hooks an operator needs.
5. Close every missing doc, example, and release note before calling the feature done.

## Outputs

- A `user-value-chain.md` note capturing the journey and the gaps.
- Docs or walk-through updates.
- Operator run-book notes.
- A release-note summary.

Pairs with the `do:docs` agent for writing the doc updates, and with `report-writing` when the
last-mile work needs a delivery report.
