---
name: prompt-builder
description: Build ONE well-structured prompt for a task interactively — present six components as options the user selects with the question tool (role + high-level task, retrieved context, detailed instructions, example, repeated critical info, anti-hallucination directives), gather content for each chosen one, and assemble them in order into a finished prompt to use now. Use to construct, scaffold, or structure a prompt, on "build me a prompt", "help me write a structured prompt", "make a prompt with these steps", "/prompt-builder". For saving a REUSABLE prompt as its own registered skill instead, use prompt-base.
argument-hint: [what the prompt is for]
---

# prompt-builder — assemble a structured prompt from selectable parts

Build a single, well-structured prompt for a task. The user picks which of six components to include —
you present them as options with the built-in question tool — supplies the content for each, and you
assemble them in order into one finished prompt to use now. This produces a prompt, not a saved skill;
for a reusable prompt saved as its own skill, use `prompt-base`.

The six components follow a prompt structure that raises accuracy and cuts invention: role first,
grounding context next, then the detailed task, a worked example, a repeat of what matters most, and
an explicit anti-hallucination block last.

## The six components — present each as a selectable option

Present these to the user with the built-in question tool (`AskUserQuestion`, `multiSelect`) so they
choose which to include. Each one is a request from the user. The tool shows at most 4 options per
question, so split the six across **two questions** — never drop a component to fit the 4-option cap.
Keep the wording of these steps exactly as written:

1. Establish role and high level task description in 1-2 sentences.
2. Dynamic/retrieved content for context.
3. Detailed task instructions.
4. Example.
5. Repeat critical information.
6. To prevent hallucinations:
   - Say "I don't know" if you don't know the answer or process asked.
   - Think before answering.
   - Answer only if you are very confident
   - Find relevant quotes from long documents then answer using the quotes where relevant.

## How each component is handled

| # | Component | What you gather from the user | Where it lands in the prompt |
|---|---|---|---|
| 1 | role + high-level task | the role/viewpoint and a 1–2 sentence task summary | top of the prompt |
| 2 | dynamic/retrieved context | the material itself, or where to fetch it at use time | a `<context>` block under the role |
| 3 | detailed instructions | the full step-by-step task instructions | main body |
| 4 | example | one worked input → output example | after the instructions |
| 5 | repeat critical information | the single most important instruction or constraint | restated near the end |
| 6 | prevent hallucinations | which guards to include — see below | closing block |

Component 2 is often a **runtime fill-in**: if the user will paste or fetch the context when they use
the prompt rather than now, mark it as a placeholder instead of freezing a specific instance in.

### Component 6 is handled differently

Ask the user appropriately which anti-hallucination guards to include (at least the
`Say "I don't know"` allowance). But whenever component 6 is chosen, the assembled prompt also **tells
itself** to:

- Think before answering,
- Answer only if it is very confident, and
- Find relevant quotes from long documents, then answer using the quotes where relevant.

These three are self-directives baked into the prompt's closing block — the skill seeks the
find-quotes-then-answer behavior, it does not ask whether to include them.

## Procedure

1. **Frame** — ask in one line what the prompt is for.
2. **Select** — present the six components as options (question tool, `multiSelect`, two questions
   because of the 4-option cap). Never force one; an unselected component is simply omitted.
3. **Gather** — for each selected component, ask for its content (table above). Mark component 2 as a
   runtime fill-in when context is supplied at use time.
4. **Anti-hallucination** — if 6 is selected, ask which guards to include, then bake the three
   self-directives above into the closing block.
5. **Assemble** — build the prompt in component order (1 → 6). Show it in full.
6. **Finish** — offer to save it to a file if the user wants it kept.

## Example

> **User:** build me a prompt to classify support tickets by urgency.
>
> **Skill:** presents the six components in two questions. User selects **1, 3, 5, 6**.
> Gathers: role = "support triage lead"; instructions = the urgency rubric; critical info = "never
> guess an urgency you can't justify from the ticket text". Component 6: user keeps the
> `I don't know` guard; the three self-directives are baked.
>
> **Output prompt:**
> ```
> You are a support triage lead. Classify each support ticket by urgency (P1–P4) in one pass.
>
> Instructions:
> - Read the ticket text and apply the urgency rubric: P1 = outage/data-loss, P2 = blocked
>   workflow, P3 = degraded, P4 = question/cosmetic.
> - Output the level and a one-line reason grounded in the ticket text.
>
> Critical: never guess an urgency you can't justify from the ticket text.
>
> Before answering: think first; answer only if you are very confident; if you don't know the
> answer or process asked, say "I don't know". For long ticket threads, find the relevant quotes
> first, then classify using those quotes.
> ```

## Output skeleton

The assembled prompt follows this shape; omit any component the user did not select.

```
[1 — role + high-level task, 1-2 sentences]

<context>
[2 — dynamic/retrieved content, or "{{paste or fetch context at use time}}"]
</context>

[3 — detailed task instructions]

<example>
[4 — input → output]
</example>

Critical: [5 — the repeated critical information]

[6 — closing block, when selected]
Before answering: think first; answer only if you are very confident; if you do not know the
answer or process asked, say "I don't know". For long source material, find relevant quotes
first, then answer using the quotes where relevant.
```

## Repeat — the critical rules (do not drop these)

- Present the six components as options with the built-in question tool; the user selects which apply.
- Split across **two questions** (4-option cap) — never silently drop a component.
- Keep the six steps' wording exact.
- Component 6: **ask** which guards to include, **and** bake the three self-directives (think first,
  answer only if very confident, find and use relevant quotes).
- Assemble in order 1 → 6, show the finished prompt in full, and offer to save it.

## Done when

The finished prompt is shown in full, contains exactly the selected components in order, the
anti-hallucination block (when chosen) carries both the asked guards and the baked self-directives,
and the user can use or save it. For a reusable prompt saved as its own skill, hand off to
`prompt-base`.
