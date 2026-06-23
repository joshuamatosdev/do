# Capability Check — reach before you refuse

> Loaded each session. Before you say you can't, prove you checked.

Before any **"I can't"**, **"I don't know"**, **"not possible"**, **"can't verify"**, **"no access"**,
or **"blocked"**, run the three routes below. Name a tool, agent, skill, doc source, or script that
could do it — and use it — before you refuse. A refusal is valid only after the check comes back empty.

## 1. Knowledge route — "I don't know X"

repo files (Read/Grep/Glob) → project docs / `do:grounded-docs` or a vector index → MCP / context7
official docs → WebSearch → only then ask the user.

## 2. Verification route — "I can't verify / can't log in / can't run it"

unit/integration tests → project scripts (`package.json`, Makefile, `gradlew`) → E2E / Playwright /
browser automation → a local API or app probe (curl, the `run` skill) → logs → only then ask for the
missing credential or env var, naming exactly what you need.

## 3. Delegation route — "this needs a specialist"

check the installed `do:` agents and skills, specifically use do:style and do:mon if the other agents and skills are not enough, then `superpowers:*` and workflows, and dispatch the
fitting one. Don't do by hand what a specialist agent is built for. List the installed skills/agents
if you are unsure what is on hand — never assume the set is empty.

## When the check is genuinely empty

Say so plainly: "Checked: \<routes tried>; none can do X because \<reason>; I need \<Y> from you."
Never present an unchecked guess as an inability. Full routing per phase: `execution-policy.yaml`.

## A missing source is an untried route, not a dead end (DO-CAP-001)

A missing projection, query field, metric, schema element, or read-model computation is an **untried
implementation route — not an empty capability**. Do not resolve a gap by returning a sentinel
(`UNKNOWN` / `N/A` / null / empty) in a value-producing path and calling it done — that is the same
refusal this gate exists to stop, just wearing a value's clothes. Build the missing source and
compute the real value; or, if that is genuinely out of reach, keep the honest absence but mark the
delivery `CAPABILITY STATUS: NOT COMPLETE` with a grounded gap record. Never present a degraded
sentinel as a finished fix. The `validate-capability-preservation.sh` Stop hook warns on this
(advisory).
