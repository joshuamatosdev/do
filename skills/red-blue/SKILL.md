---
name: red-blue
description: Run a red team and a blue team as a live agent team under one orchestrator (the team lead). The lead spawns a small team (red, blue, and a coverage-critic), tunes how hard it is for each side, sets a communication policy, and runs find → triage → fix → score rounds until the system is hardened — in a code-review (static) mode or an authorized-local-dynamic mode. Authorized, local-only targets only. Use to harden a system or batch-fix security bugs with adversarial pressure, or when the user says "run a red/blue team", "purple-team this", "set up the security team", or "/red-blue". The deterministic one-shot version is the red-blue-sweep workflow; this skill is the orchestrated, looping one.
---

# red-blue

You are the **orchestrator** — the team lead sitting on top of a red team and a blue team. You do not
attack and you do not fix. You spawn the team, set how hard each side has it, set who may talk to
whom, judge each round, and drive the loop until the system is hardened. The point is a more robust
system: real bugs found, real fixes proven, weak controls replaced.

This is the agent-team form of the `red-blue-sweep` workflow. The workflow is one deterministic pass
(find → triage → verify). This skill is the live, looping version: independent teammates, adjustable
pressure, a communication policy, and rounds — which a fixed pass can not do. Leave the workflow as
it is; reach for it for a quick one-shot, and for this skill for an orchestrated hardening loop.

## Supreme law — authorized, local-only (not optional)

Tell every teammate this at spawn, and hold it yourself:

- Teammates **review source code and config** for security gaps. No active scanning, probing,
  fuzzing, or exploitation against a running host (except in `local-dynamic` mode below, and only
  against an authorized local target).
- Any tool that reaches the network may target ONLY local addresses — `127.0.0.1`, `::1`,
  `localhost`, the private LAN ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), or a lab IP
  the user has named for this session. Everything else is refused.
- Always refused: any environment the user has not authorized; any production or shared environment;
  destructive testing (denial of service, resource exhaustion, data loss); persistence; lateral
  movement; malware; credential theft; phishing or other social engineering of real people; data
  exfiltration; public disclosure before a fix.
- If authorization or scope is not clear, stop and say so. Never assume authorization.

This is the same law `do:security-recon` follows. Report gaps; do not weaponize them.

## Two modes — pick one and say which at the start

The paired skill `security-arsenal` carries live payloads
and active-test examples. Those are catalogs to check code against, not a green light to run them.
State the mode at the start of every run:

- **`static` (default).** Code-and-config review only. The payload catalogs are read as checklists —
  "is the code open to this?" — never run. No tool reaches a running host. This is the safe default
  and matches the supreme law.
- **`local-dynamic` (opt-in, authorized).** Adds running the target locally — `do:bug-runtime`
  tests, a local fuzz run, runtime checks — but ONLY after a local-target check first: the target
  resolves to a local address, the user has authorized this session, and nothing reaches a remote or
  shared host. Use `do:security-recon` for that gate.

If you are not in `local-dynamic` mode against an authorized local target, you are in `static` mode —
review only.

## The roster

Keep the team small — **3 to 5 teammates total** (the agent-team guidance: three focused teammates
beat five that are spread thin). Default:

| Teammate | Role |
|---|---|
| `red` | Attacks: reviews the target for security gaps across the lens areas; reports findings **and** a coverage record. |
| `blue` | Defends: verifies the control for each confirmed finding; writes the fix plus a test that locks it; maps it to NIST. |
| `coverage-critic` | After each round, asks "what did we NOT probe?" — reads the coverage record, turns not-checked and missing areas into the next round's targets, so the team does not stop at the first plausible finding. |
| **Lead** (you) | Sets scope, mode, difficulty, and the communication policy; judges; runs the loop. |

Scale up only when the target genuinely spans more surface — split `red`/`blue` into per-lens pairs
(low-level, network, social), the same three lenses as the `red-blue-sweep` workflow. Do not default
to six; add a pair when the work needs it. If ready-made attacker/defender agent definitions exist in
the project, spawn the teammates from those agent types.

## Lever 1 — make it harder for one side

Set these per side at spawn, and change them between rounds. Not equal on purpose: a harder red finds
deeper bugs; a harder blue proves the fix is real, not a guess.

- **Knowledge.** Red black-box (only a description of the local target) vs white-box (reads the
  source). Blue: hand it the full finding, or only the area that failed with no detail.
- **Scope.** Widen or narrow each side's coverage areas. Harder red = fewer areas, longer
  out-of-scope list. Harder blue = must hold every area with no hint which one fired.
- **Tools.** Restrict a side's tool allowlist at spawn. Red read-only; blue may run the test suite to
  prove a fix.
- **Rounds.** Give each side its own budget — e.g. red gets two probing passes, blue gets three fix
  attempts.
- **Plan first.** Require blue to get its fix plan approved before it edits (slower, higher quality);
  require red to state its hypothesis before it probes.
- **Model.** Put a stronger model on the side you want to advantage.

## Lever 2 — a communication policy (not lead-relay)

Agent-team teammates message each other directly and self-claim from a shared task list — so you do
**not** relay every message. Routing everything through you would fill up your own context and fight the
platform. Instead, set a **policy** and hold to it through the task structure and a short per-round
summary:

- **Default: red and blue do not talk.** Make red's find tasks and blue's fix tasks separate, and
  tell each teammate which names it may message (its own side only). The two sides work blind to each
  other — the honest, harder test.
- **You carry the bridge.** Between phases, write a short per-round summary — confirmed findings,
  what to fix — and hand it to blue as a task. The summary, not a live channel, is how a finding
  crosses sides. This keeps your context small.
- **Open a purple channel only for a confirmed finding.** When red and blue should co-design one fix,
  add a single shared task that names both members and says they may talk for that task only; mark it
  done to close the channel.
- **Keep intra-team talk open.** Red members may share recon; blue members may share fixes.

Same goal as a strict matrix — control who talks to whom — but held by task rules and summaries,
not by routing every message through you.

## The round loop

1. **Set the round.** State scope, the mode, and the supreme law. Set the difficulty per side and the
   communication policy.
2. **Red attacks.** Each red member reviews its area and returns findings (title, MITRE TTP, severity,
   location, detail) **and a coverage record** — a status (clean / gap / not-checked / not-applicable)
   for every area it was asked to probe. A missing area means "not probed", which is worse than "clean".
3. **Triage — drop false alarms.** Before any fix, an independent challenge of each finding (the
   triage discipline): evidence required at the cited spot, exploitability traced,
   default-drop when not sure. Only real, evidenced findings go to blue — this keeps blue from
   burning effort on a finding that was never real.
4. **Blue defends.** For each surviving finding, blue verifies whether a real control is in place; if
   not, it writes the fix plus a test that locks it, and maps the control to NIST. Honor plan-approval
   and the communication policy.
5. **Coverage check — what did we NOT probe?** The coverage-critic reads the round's coverage records
   against the coverage charter below — so "in-scope" is a named list, not a guess. It marks which
   areas are clean (with evidence), which were not-checked, which are missing from the record.
   Not-checked and missing in-scope areas become next round's targets. This is the step that stops the
   team settling on the first plausible finding.
6. **Score and adjust.** For each finding: real control present? fix correct? new critical or high?
   Then adjust: if blue closed everything easily, harden red; if red buried blue, give blue more
   context. Stop when a set number of rounds pass with no new confirmed critical or high **and** the
   coverage record shows no in-scope area missing from it — or the budget is spent.

**Output:** the hardened code, a record of every finding with its verdict and fix, the coverage record
(every area, clean or not), and the remaining risks you could not close — each with a reason.

## Coverage charter — the classes every round must own

The coverage record is only as honest as the list it is checked against. The charter is that list:
the named classes a round must account for before it may claim the system is hardened. A class left
off the record reads as "not probed", which is worse than "clean".

**In scope.** The common web bug classes, plus the lower-level and parser
classes the engine lenses add (LDAP, XPath, CRLF/header injection, weak cryptography, numeric, supply
chain, build integrity, logging). Each class is tagged with its OWASP Top 10 (2021) home and its
lead CWE so the manifest below speaks one shared language.

**Required round artifact.** Every round produces a coverage manifest — one row per in-scope class:

| class | owner (lens / teammate) | status | evidence |
|---|---|---|---|

- **owner** — the lens or teammate that probed it. A class with no owner is a charter violation:
  assign it before the round closes.
- **status** — clean / gap / not-checked / not-applicable, the same four words the engine uses.
- **evidence** — for clean, what was read; for gap, the finding id; for not-checked, why it could
  not be assessed this round.

The round is not done while any in-scope class is missing from the manifest or sits at not-checked
with no reason. The coverage-critic owns this check (step 5 of the loop).

### Catalog → probe map

Which lens probes each catalog class, and where the engine and the catalog drift apart. A row marked
**gap** or **partial** is a documented class the engine does not fully probe — treat it as
not-covered until a lens or a teammate owns it.

| # | class | OWASP 2021 | lead CWE | probed by lens | status |
|---|---|---|---|---|---|
| 1 | IDOR | A01 | CWE-639 | api-business-ai (BOLA), low-level (data access) | probed |
| 2 | Broken auth / access control | A01 / A07 | CWE-862, CWE-287 | network (no-auth endpoints), social (auth surface) | probed |
| 3 | XSS | A03 | CWE-79 | injection-parser | probed |
| 4 | SSRF | A10 | CWE-918 | network | probed |
| 5 | Business logic | A04 | CWE-840 | api-business-ai | probed |
| 6 | Race conditions / TOCTOU | A04 | CWE-362, CWE-367 | low-level | probed |
| 7 | SQL injection | A03 | CWE-89 | injection-parser | probed |
| 8 | OAuth / OIDC | A07 | CWE-287 | social | probed |
| 9 | File upload | A04 / A03 | CWE-434 | injection-parser | probed |
| 10 | GraphQL-specific | A01 / A05 | CWE-285 | api-business-ai | probed |
| 11 | LLM / AI features | A04 / LLM01 | CWE-1427 | api-business-ai | probed |
| 12 | API misconfiguration | A05 / A08 | CWE-915, CWE-1321, CWE-347 | api-business-ai (mass assign), low-level (prototype), social (JWT), network (CORS) | probed |
| 13 | Account takeover | A07 | CWE-640 | social, api-business-ai (reset poisoning) | probed |
| 14 | SSTI | A03 | CWE-1336, CWE-94 | injection-parser | probed |
| 15 | Subdomain takeover | A05 | config (DNS) | platform-supply-chain (dangling DNS config) | probed (config) |
| 16 | Cloud / infra misconfig | A05 | CWE-732 | platform-supply-chain, network (ports) | probed |
| 17 | HTTP request smuggling | A05 | CWE-444 | api-business-ai | probed |
| 18 | Cache poisoning / deception | A05 | CWE-525, CWE-444 | api-business-ai | probed |
| 19 | MFA / 2FA bypass | A07 | CWE-287, CWE-307 | social, api-business-ai (race / skip) | probed |
| 20 | SAML / SSO attacks | A07 | CWE-347 | social (assertion verify + trust chain), injection-parser (XXE) | probed |

Both rows that used to read gap or partial are now owned by an engine lens, with one remaining recon step:

- **Subdomain takeover (15)** is now probed by `platform-supply-chain` as a config review — it reads
  committed DNS / IaC for a CNAME or alias that points at a third-party service whose backing resource
  may no longer be owned. The active half — resolving each live subdomain to confirm the record is
  truly dangling — stays a recon step; route that to `do:security-recon` in local-dynamic mode.
- **SAML signature wrapping / signature stripping (20)** is now probed by `social`, in a SAML
  assertion-verification area: signature present and covering the assertion the app actually uses
  (wrapping defense), unsigned responses rejected (stripping defense), XML comments not trusted, and
  the identity-provider certificate pinned. `injection-parser` still owns the XXE-in-assertion form.

The arsenal payload catalog (`security-arsenal`) adds XXE, path traversal, NoSQL injection, command
injection, and cross-site WebSocket hijacking — now owned by `injection-parser`, `low-level` (command
execution), and `api-business-ai` (WebSocket). The engine also probes LDAP, XPath, and CRLF/header
injection, which the catalogs do not list — engine ahead of catalog there.

## Pairs with

- `do:security-recon` — the authorization gate and safe proof-of-concept rules (and the
  `local-dynamic` local-target check).
- `do:bb-methodology` / `do:security-arsenal` — what red draws on to probe and what
  blue checks against. The triage step validates impact, reproducibility, and scope.
- `red-blue-sweep` (workflow) — the one-shot deterministic pass (find → triage → verify, with the same
  coverage record) this skill wraps in a loop.

## Limits

- **Experimental + off by default.** Agent teams need `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`.
- **On Windows you get in-process mode.** Split panes need tmux or iTerm2; cycle teammates with
  Shift+Down.
- **Token cost is real.** Each teammate is a separate model over several rounds — keep the team to
  3-5 and lean on the coverage record rather than more bodies. For a single quick check, use the
  `red-blue-sweep` workflow instead.
- **One area per teammate when fixing.** Two teammates editing the same file write over each other.
  Give each fix its own area; you put the final result together.
