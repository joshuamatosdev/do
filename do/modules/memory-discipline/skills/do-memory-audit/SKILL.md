---
name: do-memory-audit
description: Review the project's existing file-based memory for non-neutral language — brand leakage, charged or emotive wording, editorializing, and caps-for-effect — and propose a neutral rewrite for each. Reads first and proposes; edits a memory file only with approval (or for low-risk, meaning-preserving tone fixes). Use when the user says "check memory", "audit memory", "review my memories", "neutralize the memory", or "/do-memory-audit". Sibling of do-remember (which writes a fact); this one reviews what is already saved.
---

# do-memory-audit

Read existing memory, flag non-neutral language, and suggest a fixed version for each. You PROPOSE
first; change a memory file only after the user approves — or apply a low-risk, meaning-preserving
tone fix and report it. Never change what a memory asserts.

## 1. Load
- Read `MEMORY.md` (the index) and every memory file it links, in the memory dir.
- Audit the prose: the `description` line and the body. Leave frontmatter keys and values
  (`name`, `type`, `originSessionId`), dates, identifiers, and commit hashes alone.

## 2. Flag non-neutral language
- **Brand / proper-noun leakage** — a product, company, or domain name used as a general concept.
  EXCEPTION: a memory whose fact is *about* that name legitimately uses it (a de-brand rule must
  quote the brand it bans). Judge by whether the word is the subject or has leaked into generic
  guidance.
- **Charged / emotive wording** — loaded verbs and metaphors ("litters", "poison", "infect", "lead
  the witness", "stupid", "obviously", "just"/"simply" used to dismiss).
- **Editorializing** — opinion stated as fact ("the best way", "the right approach") with no ground.
- **Caps-for-effect / absolutes** — SHOUTING words, or "always"/"never"/"all" used for emphasis
  rather than as a real invariant.
- **Emoji as decoration** — emoji used as tone or status markers; memory stays plain (see the `do:style` emoji policy).

## 3. Never touch
- **Verbatim quotes.** Words in quotation marks are a faithful record of what someone said.
  Neutralizing them falsifies the record — leave them, even when charged.
- **The fact's meaning.** Neutralize tone and wording only. If a neutral rewrite would change what
  the memory asserts, flag it and stop; do not rewrite it.

## 4. Report, then fix
Return one row per flag: `memory · phrase · why · neutral rewrite`. State a confidence for each
(high for clear charged words, low for borderline tone). Then apply the approved rewrites with Edit,
keeping one-fact-per-file and the frontmatter intact; if a memory's `MEMORY.md` index hook changed,
re-sync that one line. A clean pass — nothing flagged — is a valid, reportable result.
