export const meta = {
  name: 'adversarial-review',
  description: 'Two-pass change review: a generator finds issues in the diff, then a skeptic refutes each; only survivors are reported.',
  phases: [{ title: 'Generate' }, { title: 'Refute' }],
}

// ── Pass 1 ──────────────────────────────────────────────────────────────────
// Run the generator once against the current staged/working diff.
// The agent gathers the diff itself via git.

const FINDING_SCHEMA = {
  type: 'object',
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['title', 'file', 'detail', 'severity'],
        properties: {
          title:    { type: 'string' },
          file:     { type: 'string' },
          detail:   { type: 'string' },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
        },
      },
    },
  },
}

const GENERATOR_PROMPT = `
You are a senior engineer doing a first-pass adversarial review of the current change.
Assume the change is flawed until proven otherwise.

## Your task

1. Gather the diff with:
   git diff HEAD
   If that is empty, also try: git diff --cached
   If both are empty, return { findings: [] } immediately.

2. Review every changed production file. For each, ask:
   - Does it introduce a stop-gap, fallback value, warn-and-proceed, or softened security check?
   - Does it duplicate an existing truth (parallel write path, second model for the same concept)?
   - Does it load an unbounded list where a page should be used, or filter/sort in app code where the query should?
   - Does it weaken production logic to satisfy a stale test?
   - Does it alter a public API signature, event schema, or wire format without a matching migration or version bump?
   - Does it introduce a fail-open branch (empty fallback, swallowed exception, anonymous user stand-in) on an auth or tenancy boundary?
   - Does it add commented-out code, dead branches, or temporary hacks?
   - Does it touch a cross-module boundary in a way that creates hidden coupling?

   When the change is itself a security fix (a patched check, a new validator, an added
   authorization guard, an encoded output, a tightened config), also ask — a fix can regress
   security:
   - Incomplete fix: does it close only one path to the gap and leave a sibling open — one
     injection sink fixed but not its twin, reflected XSS handled but not stored, an authorization
     check added to one endpoint but not the matching one, one tenant boundary patched of several?
   - New hole from the fix: does the fix add its own weakness — a fail-open validator, a catch
     block that lets the request through, a redirect or SSRF allowlist that is bypassable, a regex
     an attacker can stall with crafted input, an output encoding a caller can undo twice?
   - Control loosened to pass: does it widen CORS, drop a check to a warning, broaden a scope, or
     turn off a protection so the change works?
   A security fix that leaves the gap reachable, or trades it for a new one, is a critical finding.

3. Produce a finding for each concrete defect you can cite with file and line evidence.
   Do NOT invent findings — every finding must be traceable to a specific line in the diff.
   A clean change produces an empty findings array.

## Output format (JSON only — no prose)

Return a JSON object matching this shape exactly:
{
  "findings": [
    {
      "title": "<short label — what is wrong>",
      "file": "<path>:<line or range>",
      "detail": "<2-4 sentences: the underlying defect, not the symptom; name the invariant at risk; name the production-grade fix>",
      "severity": "critical | high | medium | low"
    }
  ]
}

Severity guide:
  critical — security, auth, tenancy, or data-integrity invariant broken
  high     — correctness defect; will cause wrong behavior in production
  medium   — structural debt that will compound (duplicate truth, stop-gap, unbounded load)
  low      — style or minor hygiene that does not affect correctness
`

// ── Pass 2 ──────────────────────────────────────────────────────────────────
// For each finding, the skeptic independently re-reads the diff and tries to
// prove the finding is wrong. Default to refuted=true when uncertain — the
// burden is on the finding to survive, not on the skeptic to disprove it.

const VERDICT_SCHEMA = {
  type: 'object',
  required: ['refuted', 'reason'],
  properties: {
    refuted: { type: 'boolean' },
    reason:  { type: 'string' },
  },
}

function buildRefutePrompt(finding) {
  return `
You are an adversarial second-pass reviewer. A first-pass generator produced the finding below.
Your job is to prove the finding is wrong, overstated, or does not apply to the actual diff.
You are NOT collaborating with the generator — you are trying to kill the finding.

## The finding under review

Title:    ${finding.title}
File:     ${finding.file}
Severity: ${finding.severity}
Detail:   ${finding.detail}

## Your task

1. Gather the diff with:
   git diff HEAD
   If that is empty, also try: git diff --cached
   Read the file mentioned in the finding if it exists.

2. Apply every test below against the finding. A single HIT is enough to refute it.

   | Test | Fires (refute) when |
   |------|----------------------|
   | Not in diff | The cited file:line is not actually changed in the diff |
   | Symptom mislabeled as root cause | The finding names a visible effect, not the structural defect; fixing what it says would leave the real defect untouched |
   | Fix introduces new debt | The generator's implied fix would itself violate an invariant or add a stop-gap |
   | Already handled | The change already addresses the concern the finding raises (test, guard, migration present) |
   | Phantom defect | The finding assumes a code path exists that the diff does not actually create |
   | Overstated severity | The finding labels something low-impact as critical/high with no supporting evidence |

3. Decide:
   - refuted: true  — one or more tests above fired; the finding should be dropped
   - refuted: false — none fired; the finding survives and should be reported

   When uncertain, default to refuted: true.
   The burden is on the finding to survive, not on you to disprove it.

4. Write one concise sentence for "reason" — cite which test fired (if refuted) or why none fired (if survived).

## Output format (JSON only — no prose)

{
  "refuted": true | false,
  "reason": "<one sentence>"
}
`
}

// ── Workflow body ────────────────────────────────────────────────────────────

phase('Generate')
log('Running generator pass — gathering diff and producing candidate findings…')

const generatorResult = await agent(GENERATOR_PROMPT, { schema: FINDING_SCHEMA })
const findings = (generatorResult && generatorResult.findings) || []

log(`Generator produced ${findings.length} candidate finding(s).`)

if (findings.length === 0) {
  log('No candidate findings — change is clean.')
  return { confirmed: [], dropped: 0 }
}

phase('Refute')
log(`Running skeptic pass — refuting ${findings.length} finding(s) in parallel…`)

const verdicts = await parallel(
  findings.map(f => () => agent(buildRefutePrompt(f), { schema: VERDICT_SCHEMA }))
)

const confirmed = findings.filter((f, i) => verdicts[i] && verdicts[i].refuted === false)
const dropped   = findings.length - confirmed.length

log(`Skeptic pass complete. Confirmed: ${confirmed.length}  Dropped: ${dropped}`)

if (confirmed.length > 0) {
  log('─── Confirmed findings ───')
  for (const f of confirmed) {
    log(`[${f.severity.toUpperCase()}] ${f.title} — ${f.file}`)
    log(`  ${f.detail}`)
  }
} else {
  log('All findings were refuted — change passes adversarial review.')
}

return { confirmed, dropped }
