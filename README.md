# DO: Plugin
##### DoctrineOne Labs
##### Author: Joshua Matos ([@joshuamatosdev](https://github.com/joshuamatosdev))

> **Warning:** Using this plugin's skills/agents together with hooks can sometimes lead to unexpected autonomous behavior.

**DO: Make Claude Code engineer better.**

`do` is a Claude Code plugin. One command installs a portable engineering system.

- Plugin: `do` · Marketplace: `doctrineone-labs` · Version: `0.1.29`

---
## What it does

- Installs a **tiered response format** so answers match the weight of the turn.
- Installs the **five moves** of the system and keeps them in context every session.
- Ships **16 agents** and **24 skills** you dispatch on demand (full list below).
- Wires **safety + integrity gates** as hooks: block harmful git, block stub/TODO writes,
  check the response, run an adversarial end-of-turn review.
- Adds **opt-in modules** for memory, agent teams, completion gates, and more.
- Defines **sigles** — `+name` quick procedures (`+dod`, `+bugs`, `+progress`, …) Claude keeps like memories.

Get started:

```
/plugin marketplace add joshuamatosdev/do   # add the doctrineone-labs marketplace
/plugin install do@doctrineone-labs         # install the plugin
/reload-plugins                             # load it without restarting
/do:run setup                               # install into THIS project
```

After setup, `/do:run` drives everything (see [Commands](#commands)).

---

## Callouts

### Spec YOLO mode

`/adr spec --yolo` turns the ADR + Implementation Spec path into an autonomous run. A workflow lead
reads the source, sends `do:` subagents through recon, decision resolution, section drafting, and
adversarial verification, then assembles one markdown execution contract. Use it when you need a
complete implementation spec but want the system to resolve the usual interactive questions itself;
the human review happens after the scored document is produced.

The generated spec follows the 20-section contract:

| Sections 1-5 | Sections 6-10 | Sections 11-15 | Sections 16-20 |
|---|---|---|---|
| 1. Executive Direction | 6. Functional Requirements | 11. Implementation Plan | 16. Traceability Matrix |
| 2. Context and Problem Statement | 7. Non-Functional Requirements | 12. Test and Verification Strategy | 17. Engineering Backlog |
| 3. Scope | 8. Domain Component Specification | 13. Definition of Done | 18. Appendix A — Source Evidence Summary |
| 4. Architecture Decision Record | 9. Domain Workflow Specification | 14. Rollout and Rollback | 19. Appendix B — Glossary |
| 5. Target Architecture | 10. Settings, Flags, and Configuration | 15. Risk Register | 20. Final Release Gate |

<br />

```
source report / repo
        |
        v
  adr-spec lead
        |
        +--> recon lenses read code/docs/tests
        |
        +--> plan sections + open decisions
        |
        +--> resolve decisions with no prompts
        |
        +--> draft sections to the template floors
        |
        +--> adversarial verify + one redraft pass
        |
        v
ADR + Implementation Spec markdown
        |
        v
score with tools/adr-spec-rubric.js, then human review
```


### do:mon mode

`do:mon` is the sticky external-reasoner mode. Turn it on with `/do:run mon on`; when the session
hits a high-value moment, Claude may open a fresh ChatGPT consult through the built-in Claude browser
or a browser MCP fallback, send a scrubbed prompt, and treat the answer as advisory evidence to verify
against the repo. If it changes browser drivers, it tells you the cause first.

Use it for:

- A hard bug or design call after local repo evidence is not enough.
- A repeated failure after two serious attempts.
- A load-bearing assumption before an irreversible or expensive step.
- Stop-hook surfaced `[DO:MON]` decisions that need code, ideas, definition of done, acceptance
  criteria, tradeoffs, or a long-term scalable solution.
- Manual consults with `/do:run mon <question>`.

## The five moves

The system.

Read them as a machine, not a human team — the habits built on human limits (stopping at
good-enough, copying the usual way, human-sized steps) are not yours to keep; the ones about being
correct always are. Full form in `do:style`.

1. **Engineer before implementing** — code from an explicit basis, not a guess.
2. **Minimum sufficient architecture** — the least complex design that meets the real need.
3. **Invariant-first** — name what must never break; tests prove the invariants.
4. **Bounded *and coherent* change surface** — attempts the smallest *whole* change; bring every
   place the same decision lives along with it.
5. **Lifecycle ownership** — not done at merge; it should ship, run, be fixed, and be removed.

Load the full style (outcome tests, the ADR shape, how to judge what blocks you) with
`/do:run style`.

---

## Agents

Dispatch as `do:<name>`. 

| Agent | What it does |
|---|---|
| `do:engineer` | Engineering basis before any code — need, invariants, options, choice, way back (move 1). |
| `do:distinguished-engineer` | Build a feature end-to-end in your stack, test-first; refuses hacks, TODOs, and stop-gaps. |
| `do:review` | Judge a change, design, or plan against the five moves; returns ship / ship-with-fixes / hold. |
| `do:bug-static` | Find bugs by **reading** code — control- and data-flow, unsafe patterns; each tied to file:line. |
| `do:bug-runtime` | Find bugs by **running** code — tests, repro, edge cases; each tied to a repro command. |
| `do:test-engineer` | Author one well-formed test proving one behavior at the smallest tier; proves it is not flaky. |
| `do:test-engineer-module` | Test a whole module: per-layer unit tests **and** a full handler→DB slice test. |
| `do:docs` | Write or update docs grounded in the code; flags doc-vs-code drift instead of hiding it. |
| `do:commit` | Survey the tree, group changes into clean commits, push, and heal a failed commit itself. |
| `do:security-recon` | Authorized, **local-only** security recon: scope, safe PoC, scoring, reports. Refuses public targets. |
| `do:hexagonal-refactor` | Examine a Spring Boot hexagonal app and plan a behavior-preserving refactor toward standard Spring; applies changes only when instructed. |
| `do:spring-boot-test-strategist` | Build a comprehensive Spring Boot test strategy across every layer, field, and security path using standard test libraries. |
| `do:plan-skeptic` | Press a plan in its own context; the dispatched form of the `plan-skeptic` skill. Returns Approve / Challenge. |
| `do:change-skeptic` | Interrogate a turn for integrity in its own context; the dispatched form of `change-skeptic`. Returns ALLOW / BLOCK / REPAIR. |
| `do:commit-skeptic` | Vet a staged commit in its own context; the dispatched form of `commit-skeptic`. Returns Clear / Hold. |
| `do:absolute-adversary` | The maximal adversary — prosecute a whole body of work (plan + diff + claims + commit) at once. Returns REJECT / REPAIR / WITHSTOOD. |

## Skills

Loaded on demand. Invoke by name or `/do:<name>`.

| Skill | What it does |
|---|---|
| `style` | The full five-moves engineering style with its outcome tests. |
| `compress` | Compress every reply into plain, common words at a chosen level; sticky until the session ends. |
| `setup` | The `/do:run` installer, dashboard, and phase router. |
| `mon` | Consult an external reasoner (ChatGPT) by driving your logged-in browser. Advisory, Claude will go back and forth to find a solution that works. |
| `codex` | Forward the live session to Codex (gpt-5.5, xhigh) for a second opinion; edits the repo by default — set `ASK_CODEX_ALLOW_EDITS=0` for advise-only. Needs the `codex` CLI. |
| `adr` | Write architecture decision records — one comprehensive spec, or a catalog of one-per-file ADRs. |
| `plan-skeptic` | Adversarially review a plan before any code; returns Approve or Challenge. |
| `commit-skeptic` | Adversarially review a staged commit before it lands; returns Clear or Hold. |
| `change-skeptic` | Adversarial turn-level integrity review; the in-session fallback when `codex` is absent. |
| `absolute-adversary` | The maximal, all-lens adversary: prosecute a whole body of work at once; assume compromise, build the strongest true counter-case, re-run every "it works". Returns REJECT / REPAIR / WITHSTOOD. |
| `codebase-cartography` | Map a repo to architecture diagrams (ASCII + Mermaid) and a structured report. Read-only. |
| `grounded-docs` | Stand up a citation-ready documentation index so agents answer from pinned sources. |
| `report-writing` | Fill a JSON payload, then render a single self-contained HTML engineering report. |
| `user-value-chain` | Close the last mile from "the code works" to "a user can find, run, and operate it." |
| `red-blue` | Run a live red/blue hardening team under one lead (authorized, local-only). |
| `bb-methodology` | A five-phase bug-bounty workflow with per-phase tool routing. Authorized, scoped testing only. |
| `security-arsenal` | A payload and bypass-table reference to check code against (never a green light to fire). |
| `prompt-base` | Build a reusable, presaved prompt as a skill — author the six prompt-engineering slots once, fill in task + context per use; or promote a `+sigle` into a registered skill. |
| `prompt-builder` | Build ONE structured prompt now — pick from six components (role + task, context, instructions, example, repeated critical info, anti-hallucination block) and assemble them in order. |
| `terminal-check` | The pre-stop self-check: classify every open item, take the first runnable ACT, stop only on a RoundLog-backed `[EXTERNAL-INPUT]`. The self-run replacement for the old continuation Stop hook (no re-fire, no churn). |
| `do-route` | Route a task to the best-fit agent, team, or general-purpose. *(task-router module)* |
| `do-team` | Run the engineering agents as a team to build a feature. *(agent-team module)* |
| `do-remember` | Save a durable fact to the project's file-based memory. *(memory-discipline module)* |
| `do-memory-audit` | Review saved memory for non-neutral language and suggest neutral rewrites. *(memory-discipline module)* |

The last four ship with their modules — enable the module to get the skill.

## Security tools

`bb-methodology`, `security-arsenal`, `red-blue`, and `do:security-recon` route to external security
CLIs that `do` does **not** bundle or require — all optional, for authorized / local-only use. See
the skill's tool-routing table for the list; install what you use.

## Sigles

`+name` procedures — lightweight, Claude-maintained routines kept like memories (in `SIGLES.md`)
and invoked by typing the sigil. Claude writes, updates, and prunes them; `+sigle` manages the
catalog, and `+promote` graduates one when it outgrows the catalog. They are not registered skills.

| Included Sigle | What it does |
|---|---|
| `+sigle` | Create, list, update, or prune sigles. |
| `+promote` | Graduate a reusable sigle into a real Claude Code skill. |
| `+skills` | Explain what skills are and how to use them, from the live session catalog. |
| `+dod` | Pin the definition of done — goal + falsifiable acceptance criteria, before building. |
| `+progress` | A grounded record of what this session changed — files, commits, decisions, what's left. |
| `+bugs` | Surface bugs noticed this session — symptom, `file:line`, why it is wrong. |
| `+perfcheck` | Surface performance wins in touched code — hot path, `file:line`, expected gain. |
| `+simplify` | Simplify code touched this session without changing behavior or tests. |

## Workflows

Deterministic, multi-agent scripts under `workflows/`. Run with the Workflow tool by path.

| Workflow | What it does |
|---|---|
| `red-blue-sweep` | One deterministic red/blue pass: parallel attacker lenses find, matched defenders verify. |
| `adversarial-review` | Generate findings on a diff, then refute each; only survivors are reported. |
| `adr-spec` | A team-led pipeline that produces one ADR + implementation spec as an execution contract. |

## Modules (opt-in)

Modules are chosen at `/do:run setup` or added with
`/do:run add <module>`.

| Module | What it adds | Needs |
|---|---|---|
| `completion-gates` | evidence gates: schema/DB, security, API/contract, operations. | — |
| `memory-discipline` | File-based memory: a `MEMORY.md` index + one-fact-per-file + `do-remember` (write) and `do-memory-audit` (review). | — |
| `codex-integrity` | A Stop hook that sends the (scrubbed) assistant turn text to an external Codex LLM for adversarial review (read-only file access); fail-open to `change-skeptic` when Codex is absent. | `codex` CLI |
| `codex-frontier` | A Stop hook that drains open non-`[EXTERNAL-INPUT]` frontier items and aligns changed code to its registered ADR / grounded-docs spec via a DO:MON consult; fail-open. | `jq` CLI |
| `commit-doctor` | Auto-heals a failed `git commit` (classify → fix → retry, never `--no-verify`). | `jq` CLI |
| `git-gate` | PreToolUse (Bash\|PowerShell) default-deny git allowlist: blocks destructive / history-rewriting git (`reset --hard`, `checkout`, `switch`, `rebase`, `merge`, force-push, branch create/delete, `stash`, `--no-verify`/`--amend`); allows read-only + safe forms (add, commit, push non-force, fetch, pull). | `node` |
| `task-router` | The `do-route` skill. | — |
| `agent-team` | The `do-team` skill; enables the experimental agent-teams flag. | — |
| `oppihtnias` | A per-session, machine-readable task state (goal, acceptance criteria, tasks) as a typed `.ts` module in the OS temp folder. | — |

---

## How the hooks fit together

```
SESSION START
  load-do-one.sh            -> the five moves into context
  load-capability-gate.sh   -> "check before you say you can't"
  do-compress-activate.js   -> compression mode (if on)
  do-mon-activate.js        -> external-reasoner mode (if on)
  oppihtnias-activate.js    -> seed this session's task state

EACH USER PROMPT
  do-compress-tracker.js / do-mon-tracker.js -> track + toggle those modes

BEFORE A TOOL RUNS  (PreToolUse)
  Bash | PowerShell  -> git-gate.sh           (opt-in git-gate module: block harmful git)
                        route-codex-to-skill.sh (route Codex consults through the do:codex skill)
  Edit | Write       -> protect-user-work.sh   (reserved no-op)
                        block-stub-write.sh    (no stubs / TODOs)
                        docs-compliance-check.sh (spec & reference compliance)

AFTER A BASH RUN  (PostToolUse)
  commit-doctor.sh   -> heal a failed git commit

TURN END  (Stop)
  validate-continuation.sh    -> deterministic backstop: no hand-back while an ACT exists; terminal only with a RoundLog
  codex-stop.sh               -> Codex integrity review + DO:MON frontier drain
  (the self-run terminal-check skill + RESPONSE-FORMAT self-check are the primary; the hook is the floor)
```

## How `do:mon` works

A second opinion from an external reasoner, driven through your
browser.

```
  do:mon mode ON  ->  high-value moment?
                      (stuck >=2 tries / hard bug / about to bet on a shaky assumption)
                              |  yes
                              v
   +--------------------------------------------+
   | Claude (this session)                      |
   |  1. scrub the prompt (no .env / keys / PII)|
   |  2. drive your logged-in browser           |   built-in Claude browser first;
   |     (fallback: browser MCP)                |   announce switch + cause
   +--------------------------------------------+
                  |  prompt-only by default; each consult announced
                  v
        +----------------------+
        |  ChatGPT (your acct) |  <- you stay logged in; no creds handled
        +----------------------+
                  |  reasons (minutes) -- Claude does useful local work meanwhile
                  v
   read the answer back  ->  ADVISORY: verify against the real code, log it, move on
```

## How agent teams / red-blue work

Teams need the `agent-team` module (it sets the experimental agent-teams flag). One **lead**
orchestrates; teammates work in parallel and talk to each other directly. Can trigger automatically
or on your command. (high token usage)

```
  do-route  ->  picks one of:  a single do agent | do-team | red-blue | general-purpose

  do-team (BUILD)                          red-blue (HARDEN, authorized/local-only)
  -----------------                        ----------------------------------------
       LEAD                                          LEAD (you)
        | decompose + assign                           | scope, mode, difficulty, judge
        v                                              v  spawns
  engineer                                   +--------+--------+----------------+
  distinguished-engineer                     v        v                        v
  test-engineer                             red     blue              coverage-critic
  docs                                   attack -> verify+fix         "what did we
        | integrate + gate                  |        |                 NOT probe?"
        v                                    +-- find -> triage -> fix -> score --+
      ship                                            loop until hardened
```

`red-blue` runs in **static** mode (code review) by default; **local-dynamic** is opt-in and
only against an authorized local target. The deterministic one-shot version is the
`red-blue-sweep` workflow.

---

## Commands

`/do:run` is the single entry point.

| Command | What it does |
|---|---|
| `/do:run setup` | Detect the project and install the system into its `.claude/`; pick modules (`setup all` enables every module). |
| `/do:run status` | Dashboard: version, enabled modules, drift, missing deps, `git status`. |
| `/do:run fix` | Diagnose install health — version, drift, missing soft-deps, settings drift (report only, no auto-repair). |
| `/do:run add <module>` | Enable a module on an existing install. |
| `/do:run remove` | Clean uninstall: strip the managed `CLAUDE.md` block + do-owned hooks/env, restore the pre-do backup, remove the manifest + installed files. |
| `/do:run execute` | Run a plan under the model-discipline guide (Sonnet for mechanical, Opus for judgment). |
| `/do:run review` | Run code / security / adversarial review chosen by diff risk. |
| `/do:run verify` | Verification + tests + a real run; "it compiled" is not verification. |
| `/do:run handoff` | Write a YAML session handoff and save durable facts. |
| `/do:run style` | Load the full five-moves engineering style. |
| `/do:run compress plain\|strict\|off` | Set the reply-compression level. |
| `/do:run codex on\|off\|status` · `/do:run mon on\|off\|status` | Toggle the integrity review and the external reasoner. |

**Updating the plugin.** Plugin updates go through Claude Code's own plugin manager, not a `do`
subcommand: run `claude plugin update do@doctrineone-labs`, then **restart Claude Code** to load the
new version (the running session is pinned to the version it started with — no in-session command can
hot-swap it). After the restart, re-run `/do:run setup` in a project to refresh its copied workflow
files to the new version (`do.config.json` is preserved).

The phase commands are thin routers into the underlying skills — they apply the five moves and model discipline, then run the right skill. The skills still work on their own.

---

## Design notes

Two deliberate choices shape how `do` behaves:

- **Two-part install.** Portable docs (response format, the five moves, config) are *copied*
  into the target so the project is self-documenting and the system travels with a clone.
  Hook *logic* stays in the plugin manifest and loads via `${CLAUDE_PLUGIN_ROOT}`, so safety
  and integrity fixes apply everywhere at once without re-installing.
- **Self-gating.** Manifest hooks load in every plugin-enabled project, but the ones that
  *block* first check for `.claude/do.manifest.json` and no-op when it is absent. The
  system only enforces where you ran `/do:run setup`.

---

## Development

**Runtime:** Node.js. The Node core has zero npm dependencies, but the hook layer requires
bash, jq (3 hooks), and PowerShell (on Windows).

**Run the tests**:

```
node --test "tests/*.test.js"
```

**Key paths:** plugin manifest `.claude-plugin/plugin.json` · marketplace
`.claude-plugin/marketplace.json` · agents `agents/` · skills `skills/` · workflows
`workflows/` · spine + modules `do/`.

**Contributing:** [CONTRIBUTING.md](CONTRIBUTING.md) · [SECURITY.md](SECURITY.md) · [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) · [CHANGELOG.md](CHANGELOG.md).

---

## License

Apache-2.0 — see the [LICENSE](LICENSE) file for the full text.
Copyright 2026 Joshua Matos.

---

## Benchmark results

A/B eval of the `do` styles/agents vs a plain baseline — same model per run, only the system
prompt differs. Read-only tasks against a private Java/Kotlin codebase, sonnet, 3 tasks × 2 reps,
24/24 valid runs. All arms cited real code equally well (verified programmatically), so quality
was a tie; the win is efficiency. Detail: [bench/style-eval/REPORT.md](bench/style-eval/REPORT.md).

arm | out tok | cost $ | latency s | grounding/ans | vs baseline
---|---|---|---|---|---
baseline | 7274 | 0.649 | 160 | 8.3 | —
do_style | 5022 | 0.434 | 125 | 7.5 | −33% cost, −22% latency
do_compress | 4570 | 0.283 | 99 | 5.5 | −56% cost, −38% latency
do_agent | 5052 | 0.611 | 184 | 7.3 | −6% cost, +15% latency
