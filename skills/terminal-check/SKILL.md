---
name: terminal-check
description: The pre-stop self-check — run before ending any turn, finishing, or handing work back. Decides act-vs-stop in one reasoning pass: classify every open item, take the first runnable ACT, and stop only on a RoundLog-backed [EXTERNAL-INPUT]. The dynamic replacement for the continuation Stop hook (self-run, so no re-fire and no token churn). Triggers on "I'm done", "awaiting your direction", an open `- [ ]` list, or any decision to stop or hand back.
---

# terminal-check — decide act-or-stop before you stop

> The dynamic replacement for the continuation Stop hook. The hook judged a premature stop from the
> OUTSIDE and re-fired until satisfied — that re-fire is the token churn. This skill runs the same
> judgment from the INSIDE, once, so you converge with no re-fire. It is authored in the six-part
> prompt format and grounds every step in `.claude/do/terminal-discipline.md`.

## 1. Establish role and high level task description in 1-2 sentences.

You are your own stop-or-act controller. Before ending any turn, decide in one internal pass whether a
next ACT exists, and stop only on a proven terminal.

## 2. Dynamic/retrieved content for context.

Gather, fresh from THIS turn (this is what the hook re-derived in a subprocess; you read it live): the
open `- [ ]` items you are about to leave, the requested objective, the discovered frontier, and the
spec `.claude/do/terminal-discipline.md` — §2 terms, §3 table, §4 protocol, §5 RoundLog. These change
every turn; read them, do not assume them.

## 3. Detailed task instructions.

Run terminal-discipline §4 over the stop you are about to make, in reasoning, once:

1. State the candidate: "I am about to stop with these open items / on this hand-back."
2. Falsify "no ACT exists" with the §4 lenses — internal-reasoner, consult-reasoner,
   adversarial-review, creative-analysis, driven-directive, machine-intelligence-limitless. Each asks:
   is there an ACT here I can take now.
3. Classify EACH open item by the §3 table. AGENT / DERIVE / TEST / CONSULT / PARAMETERIZE / DEFAULT
   are machine-runnable → take the first one's ACT now, this turn. [EXTERNAL-INPUT] — a credential you
   cannot compute, or a SAFETY_GATE (irreversible AND outward AND consequential) — is the ONLY terminal.
4. If any lens or item yields an ACT → take it, then re-run this check. If none do AND the candidate is
   [EXTERNAL-INPUT] → write the §5 RoundLog and stop. Otherwise you are not done — keep going.

Because this runs BEFORE you emit the stop, there is no block-and-re-fire: the churn source is gone.

## 4. Example.

You are about to stop with `- [ ] regenerate the client (blocked on a 500)`. The old hook would block,
you would retry, it would block again — repeated full re-processing of the turn. Instead you classify
it: it is DERIVE (probe the 500 — read the response, the route, the contract) plus CONSULT (do:mon).
You probe, find the 500 is a stale spec path, fix it, regenerate, verify. One pass, you converge, you
stop once — the same outcome the hook drove toward, without the churn.

## 5. Repeat critical information.

One internal pass. Take the first ACT found. Stop ONLY on a RoundLog-backed [EXTERNAL-INPUT]. There is
no external gate now — the discipline is yours to run, every turn, before you stop.

## 6. To prevent hallucinations:

- Say "I don't know" if you don't know the answer or process asked. → when an item is unclear, emit a
  DERIVE or CONSULT route and run it; never fabricate a "done" or a terminal you did not earn.
- Think before answering. → run §4 in reasoning BEFORE you emit the stop, not after it.
- Answer only if you are very confident → stop only when the §4 predicate `TERMINAL_ADMISSIBLE` holds
  (every lens ran and found no ACT, ≥5 trials, converged, an independent concurrence, RoundLog present).
- Find relevant quotes from long documents then answer using the quotes where relevant. → your RoundLog
  and your report cite the actual open items, code `file:line`, command output, and spec lines —
  quotes, not recall.

## Done when

You have either taken an ACT (and will re-run this check), or you are stopping on a single
[EXTERNAL-INPUT] item carrying a well-formed §5 RoundLog. "Awaiting your direction", an open
non-[EXTERNAL-INPUT] item, or a stop with no RoundLog means you are NOT done — continue.
