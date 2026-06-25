---
name: prompt-base
description: Guide the user to build a reusable, presaved prompt as a registered skill — author six prompt-engineering slots once (persona, task, context, exemplars, format, tone), so that per use only the task and context are supplied. Offers technique-backed options at each slot and lets the user choose. Produces a SKILL.md the user invokes later. Use to turn a recurring prompt into a saved skill, build a prompt template, or on "save this prompt as a skill", "make a base prompt", "/prompt-base".
argument-hint: [what recurring task the prompt is for]
---

# prompt-base — build a presaved prompt as a skill

Turn a recurring prompt into a **saved skill** the user reuses, where the engineering is done once
and only the per-use parts are filled in later. The user answers six prompt-engineering slots; you
offer help and options at each; the output is `.claude/skills/<name>/SKILL.md` in the user's project,
ready to invoke by name.

This is *technique-guided prompt authoring* — distinct from `+sigle` (lightweight procedures Claude
runs) and from a generic skill scaffold. Every slot encodes a named prompting technique, so the saved
prompt is engineered, not guessed.

## The model — two tiers of slot

A good reusable prompt separates what is **fixed** from what **changes each time**.

| Tier | Slots | Where it lives in the output |
|---|---|---|
| **Baked once** (authored now) | Persona · general Task shape · Format · Tone · Exemplars | static prose in the produced `SKILL.md` body |
| **Filled per use** | the specific Task instance · Context | the user's own message when the skill loads |

A `SKILL.md` has no `$ARGUMENTS` substitution like a slash command does. So the fill-in works by
design: when the saved skill loads, the user's current request **is** the task + context, and the
baked body tells the model to apply the persona, format, tone, and exemplars to it. That is why
"context comes from the user" — it is supplied at use time, never frozen into the template.

## The six slots and the technique each encodes

| Slot | Technique | What it does |
|---|---|---|
| **Persona** | role prompting | Sets the expert viewpoint and register; raises domain accuracy. |
| **Task** | explicit instruction | The single, verb-first objective with its success criteria. |
| **Context** | grounding (fill-in) | The user's per-use material; anchors specifics, cuts invention. |
| **Exemplar** | few-shot | Shows input→output so format and standard are taught by example. |
| **Format** | output contract | Structure (sections / JSON / table / length) — makes output usable and checkable. |
| **Tone** | style control | Register and voice matched to the reader. |

## How to run it

### Step 1 — Frame the prompt

Ask one question: **what recurring task is this prompt for?** From the answer, draft a working skill
**name** (kebab-case) and a one-line **purpose**. Confirm the name before building — it becomes the
directory and the invocation.

### Step 2 — Walk the six slots in order

Order: **Persona → Task → Context → Exemplar → Format → Tone.** For each slot:

1. State in one line what the slot is and the technique it encodes.
2. Ask: **"Draft this yourself, or want options?"**
3. If they want options, present 2–4 technique-backed choices (use the question tool so they pick) —
   from the library below — and let them choose or combine.
4. Record the result. Mark **Context** and the **task instance** as *fill-in*, not baked.

Never force a slot. If a slot does not apply, mark it **skipped** and move on — a smaller correct
prompt beats a padded one.

### Step 3 — Assemble and show

Build the `SKILL.md` from the slots (skeleton below) and show it to the user in full before saving.

### Step 4 — Sharpen the description

A skill auto-triggers on its `description`, so the description is load-bearing. Write one that names
**what the prompt produces and when to reach for it**, in concrete words, plus a couple of trigger
phrases. Avoid vague descriptions ("helps with writing") — they either never fire or fire on
everything. Propose it, confirm it.

### Step 5 — Save and verify

Write to `.claude/skills/<name>/SKILL.md` in the user's project (create the directory). Offer a
dry run: invoke it with a sample task and show the result, so the user sees the baked prompt working
before they rely on it.

### Step 6 — Light check before done

- Every slot is **resolved or explicitly skipped** — none silently dropped.
- The **fill-in** (context + task instance) is clearly marked in the body, not hard-coded.
- The **description** is specific, not generic.
- The skill **name** is kebab-case and matches its directory.

## Option library

Offer these as the "want options?" choices. Pick the few that fit the task; combine freely.

**Persona** (role prompting)
- *Domain expert* — "a senior <field> practitioner" → maximum depth and accuracy.
- *Peer reviewer / critic* — pushes back, finds flaws.
- *Teacher / explainer* — clarity for a learner.
- *No persona* — when a role would bias a neutral task.

**Task** (explicit instruction)
- *Single imperative* — one verb + object ("Summarize…", "Draft…", "Classify…").
- *Step-decomposed* — do A, then B, then C.
- *Answer-from-context* — "answer using only the provided context."
- *With success criteria* — bake the constraints the output must meet.

**Context** (grounding — this is the fill-in)
- *Inline paste* — the user pastes the material at use time.
- *File / link reference* — the prompt names where to read context from.
- *Structured fields* — audience = … , goal = … , constraints = … .
- Always mark this as the runtime fill-in, never freeze a specific instance into the template.

**Exemplar** (few-shot)
- *Zero-shot* — no example; simplest tasks, fewest tokens.
- *One-shot* — one input→output pair.
- *Few-shot (2–5)* — for format-strict or pattern-heavy tasks.
- Picking good ones: representative, varied, and correct — a wrong example teaches the wrong thing.

**Format** (output contract)
- *Markdown sections* — headings for human reading.
- *JSON / schema* — when the output is machine-consumed; pin the exact fields.
- *Table* — for comparisons or rows.
- *Numbered steps / bullets* — for procedures or lists.
- *Length / limit* — cap words, sections, or items.

**Tone** (style control)
- *Neutral / professional* · *Warm / encouraging* · *Terse / no-fluff* · *Formal / academic*.
- Or *match the audience* — name the reader and let voice follow.

## The output skeleton

The produced `.claude/skills/<name>/SKILL.md` follows this shape — baked slots as prose, the closing
line wiring the fill-in to the user's request:

```markdown
---
name: <kebab-name>
description: <specific description + trigger phrases — load-bearing for auto-trigger>
---

# <name>

[Persona]  You are <role / expertise / viewpoint>.

[Task]  <the general task, verb-first, with any baked success criteria>.

[Format]  <the output contract — sections / JSON / table / length>.

[Tone]  <register and voice>.

[Exemplars]  <0, 1, or a few input→output examples — omit if zero-shot>

---
Apply all of the above to the user's current request. Their message is the
**task instance and the context** — treat it as the fill-in. If required context
is missing, ask for it before producing the output.
```

## Done when

The `SKILL.md` is written to the user's `.claude/skills/<name>/`, every slot is resolved or skipped,
the fill-in is marked, the description is specific, and (offered) a dry run shows the baked prompt
producing the intended output. When the prompt outgrows a single file or needs supporting assets,
hand off to `superpowers:writing-skills` or `+promote` to graduate it.
