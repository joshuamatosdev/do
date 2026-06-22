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
