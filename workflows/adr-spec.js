// adr-spec — YOLO workflow: a team leader drives do: subagents to produce a
// comprehensive ADR + Implementation Spec with no human prompts.
//
// Modeled on workflows/red-blue-sweep.js. The flow is:
//   Recon   → bounded read-only recon lenses gather grounded facts (file:line).
//   Plan    → the leader turns findings into a section plan + the open decisions.
//   Resolve → one agent per decision picks chosen + rejected + why (no prompts).
//   Draft   → one drafter per section fills it to the template's floors.
//   Verify  → an adversarial check scores each draft against its floors; a
//             below-floor section gets one redraft.
//   Assemble→ the leader stitches the title block, metadata table, and sections
//             (in canonical order) into one markdown document and returns it.
//
// The structure contract is the committed template; pass its absolute path as
// args.templatePath so drafters/verifiers read exact floors from the single
// source of truth. The ordered title list below fixes section order + the
// fan-out set deterministically.
//
// Inputs (args):
//   source            absolute path (or inline text) of the status report / repo to ground in
//   templatePath      absolute path to adr-implementation-spec.template.yaml
//   product, subject, version, primaryRepository, sourceReportId, sourceGeneratedAt, confidence
//
// Returns: { markdown, sections: [{title, verdict}], openGaps: [...] }

export const meta = {
  name: 'adr-spec',
  description: 'YOLO ADR + Implementation Spec: a team leader drives recon, decision resolution, section drafting, and adversarial verification, then assembles one execution-contract document.',
  phases: [
    { title: 'Recon' },
    { title: 'Plan' },
    { title: 'Resolve' },
    { title: 'Draft' },
    { title: 'Verify' },
    { title: 'Assemble' },
  ],
}

// ── Read-only posture (prepended to recon prompts) ───────────────────────────
const READONLY = `GROUND RULES (non-negotiable):
- You READ source, config, docs, git history, and the named source document to gather facts.
- You do NOT modify files, run destructive commands, or reach the network for active probing.
- Every factual claim you return carries evidence: a file:line, a commit SHA, or the source doc.
- If you cannot verify a claim, mark it unverified rather than inventing it.

`

// ── Canonical section order (mirrors the template; fixes order + fan-out set) ──
const SECTION_TITLES = [
  'Executive Direction',
  'Context and Problem Statement',
  'Scope',
  'Architecture Decision Record',
  'Target Architecture',
  'Functional Requirements',
  'Non-Functional Requirements',
  'Domain Component Specification',      // conditional
  'Domain Workflow Specification',       // conditional
  'Settings, Flags, and Configuration',
  'Implementation Plan',
  'Test and Verification Strategy',
  'Definition of Done',
  'Rollout and Rollback',
  'Risk Register',
  'Traceability Matrix',
  'Engineering Backlog',
  'Appendix A — Source Evidence Summary',
  'Appendix B — Glossary',
  'Final Release Gate',
]

// ── JSON Schemas ─────────────────────────────────────────────────────────────

const FINDINGS = {
  type: 'object',
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['claim', 'evidence'],
        properties: {
          claim:    { type: 'string', description: 'A grounded fact about the system or product direction.' },
          evidence: { type: 'string', description: 'file:line, commit SHA, or the source document reference.' },
          implication: { type: 'string', description: 'Why it matters for an architecture decision (optional).' },
        },
      },
    },
  },
}

const PLAN = {
  type: 'object',
  required: ['includeSections', 'decisions'],
  properties: {
    includeSections: {
      type: 'array',
      items: { type: 'string' },
      description: 'The section titles to include — the 18 always-required plus any conditional Domain section the system justifies.',
    },
    decisions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'question'],
        properties: {
          id:       { type: 'string', description: 'D-1, D-2, …' },
          question: { type: 'string', description: 'The open architecture decision to resolve.' },
          options:  { type: 'array', items: { type: 'string' }, description: 'Candidate options.' },
        },
      },
    },
    domainTitles: {
      type: 'array',
      description: 'For each INCLUDED conditional Domain section, a specialized domain-specific title to render in place of the generic one (e.g. "Provider Architecture Specification" for "Domain Component Specification").',
      items: {
        type: 'object',
        required: ['section', 'title'],
        properties: {
          section: { type: 'string', description: 'The generic template title — "Domain Component Specification" or "Domain Workflow Specification".' },
          title:   { type: 'string', description: 'The specialized title to render for this product.' },
        },
      },
    },
  },
}

const DECISION = {
  type: 'object',
  required: ['id', 'chosen', 'rejected', 'why'],
  properties: {
    id:       { type: 'string' },
    chosen:   { type: 'string', description: 'The decision taken, stated as an enforceable instruction.' },
    rejected: { type: 'array', items: { type: 'string' }, description: 'Paths not taken.' },
    why:      { type: 'string', description: 'Why the chosen path beats the rejected ones.' },
  },
}

const SECTION_DRAFT = {
  type: 'object',
  required: ['title', 'markdown'],
  properties: {
    title:    { type: 'string' },
    markdown: { type: 'string', description: 'The full markdown for this section, headed `## N. Title`, meeting every floor.' },
  },
}

const VERDICT = {
  type: 'object',
  required: ['title', 'meetsFloors', 'gaps'],
  properties: {
    title:       { type: 'string' },
    meetsFloors: { type: 'boolean', description: 'true only if every floor in the template for this section is met.' },
    gaps:        { type: 'array', items: { type: 'string' }, description: 'Each unmet floor, named.' },
  },
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// Every dispatched agent runs with cwd = the repository, so scratch files must be
// kept OUT of the working tree. This rule rides on srcLine (recon/plan/resolve/
// draft/redraft) and is repeated in the verify prompt, which does not use srcLine.
const SCRATCH = `TEMP FILES: write any scratch, draft, scoring, or intermediate file ONLY to the OS temp directory — in shell use \`mktemp\` or $TMPDIR (on Windows that resolves under %TEMP%); in Node use os.tmpdir(). NEVER write a temp/scratch file into the repository working tree. Return your work as your structured result, not as a file in the repo.`

const srcLine = (a) => `SOURCE: ${a.source}\nTEMPLATE (the structure contract): ${a.templatePath}\nPRODUCT: ${a.product || '<product>'}  SUBJECT: ${a.subject || '<subject>'}  VERSION: ${a.version || 'v1'}\n${SCRATCH}`

function reconLens(area, focus, a) {
  return `${READONLY}You are a do:engineer recon lens for an ADR + Implementation Spec.
${srcLine(a)}

Your bounded area: ${area}.
${focus}

Read the source document and the relevant code/config. Return grounded findings (claim + evidence).
Do not stray outside your area. Do not propose decisions — just report what is true.`
}

// ── Workflow ─────────────────────────────────────────────────────────────────

// The Workflow runtime can deliver `args` as a JSON string rather than a parsed
// object; accept either so `a.source`, `a.product`, etc. resolve correctly.
const a = (() => {
  if (args && typeof args === 'object') return args
  if (typeof args === 'string' && args.trim()) { try { return JSON.parse(args) } catch { return {} } }
  return {}
})()

phase('Recon')
log('adr-spec YOLO: read-only recon to ground the spec. No files are modified.')

const LENSES = [
  reconLens('Purpose, scope, and current state',
    'README, product docs, module layout, conventions, ownership signals, the stated direction and the gap to it.', a),
  reconLens('Public interfaces and contracts',
    'CLI/API/SDK surfaces, routes, events, file formats, provider/adapter contracts, compatibility expectations.', a),
  reconLens('State, data, and integrations',
    'persistence, schemas, source-of-truth boundaries, external services, generated clients, queues, plugins.', a),
  reconLens('Runtime, operations, security, and tests',
    'deploy/config/flags, observability, failure/recovery, authn/authz, secrets, test strategy and quality gates.', a),
]

const recon = (await parallel(
  LENSES.map((p) => () => agent(p, { label: 'recon', phase: 'Recon', schema: FINDINGS })),
)).filter(Boolean)

const findingsText = recon
  .flatMap((r) => (r.findings || []))
  .map((f) => `- ${f.claim}  [${f.evidence}]${f.implication ? `  → ${f.implication}` : ''}`)
  .join('\n')

phase('Plan')
const plan = await agent(
  `You are the team leader for an ADR + Implementation Spec.
${srcLine(a)}

Recon findings:
${findingsText}

The canonical section set is:
${SECTION_TITLES.map((t, i) => `${i + 1}. ${t}`).join('\n')}

Two sections are CONDITIONAL — include "Domain Component Specification" only if the system has a
domain subsystem with its own contract (e.g. a provider/adapter family), and "Domain Workflow
Specification" only if it has a structured workflow with verifiable states. Always include the other 18.

Produce:
1. includeSections — the titles to include, in canonical order (use the generic template titles here).
2. decisions — the open architecture decisions this spec must resolve (D-1, D-2, …), each with candidate options.
3. domainTitles — for EACH included conditional Domain section, a specialized domain-specific title for THIS product (e.g. "Provider Architecture Specification" instead of "Domain Component Specification", "Interface Mode Specification" instead of "Domain Workflow Specification"). Omit a generic Domain section you did not include.
Resolve nothing yet; just name the decisions.`,
  { label: 'plan', phase: 'Plan', schema: PLAN },
)

const include = (plan && plan.includeSections && plan.includeSections.length)
  ? SECTION_TITLES.filter((t) => plan.includeSections.includes(t))
  : SECTION_TITLES.filter((t) => !/^Domain /.test(t))

// Specialized render titles for the conditional Domain sections (template title stays
// the lookup/order key; only the rendered "## N. <title>" heading changes).
const renderTitleMap = {}
;(plan && plan.domainTitles ? plan.domainTitles : []).forEach((d) => {
  if (d && d.section && d.title) renderTitleMap[d.section] = d.title
})
const renderTitleOf = (t) => renderTitleMap[t] || t

phase('Resolve')
const decisions = (await parallel(
  (plan && plan.decisions ? plan.decisions : []).map((d) => () =>
    agent(
      `You are the decision owner for this ADR. Resolve ONE open decision with no human input.
${srcLine(a)}

Recon findings:
${findingsText}

DECISION ${d.id}: ${d.question}
Candidate options: ${(d.options || []).join(' | ') || '(derive from the findings)'}

Pick the path that best fits the real domain, security, data, runtime, and lifecycle needs.
Return chosen (as an enforceable instruction), rejected (paths not taken), and why.`,
      { label: `resolve:${d.id}`, phase: 'Resolve', schema: DECISION },
    ),
  ),
)).filter(Boolean)

const decisionsText = decisions
  .map((d) => `${d.id}: CHOSE ${d.chosen}\n    rejected: ${(d.rejected || []).join('; ')}\n    why: ${d.why}`)
  .join('\n')

// The completeness scorer (tools/adr-spec-rubric.js) keys on exact markdown tokens.
// Every drafter and verifier is held to this shape so good content is not under-scored
// for cosmetic reasons.
const FORMAT = `OUTPUT FORMAT — the completeness scorer reads these exact tokens. Follow them verbatim:
- Section heading: a level-2 heading "## N. <Title>" — the section number and the EXACT title from the template.
- Every block that has a title (a list or a table): a markdown heading whose text is the block's EXACT title from the template (e.g. "### Non-negotiable product decisions"). The scorer finds a block by this title text, so do not rename it.
- Lists: one "- " bullet per item directly under that block-title heading; meet the item floor.
- Tables: a GitHub table whose header row has the template's EXACT column names, then a "| --- |" separator, then one row per entry; meet the row floor. Leave a blank line before and after each table.
- Functional Requirements: render each requirement as its own heading "### FR-1", "### FR-2", … (the scorer counts "FR-<n>" headings); under each FR put headings "### Intent", "### Required behavior", "### Acceptance criteria", "### Required verification" with their "- " bullets. Produce at least the FR count floor.
- Diagram / code / state-machine / issue-template blocks: a fenced \`\`\` block — NEVER a list of headings. The Engineering Backlog "Suggested issue template" is a fenced block, not "## Epic" / "## Intent" headings.
- HEADINGS: ONLY the section title is a level-2 "## " heading. Every block or sub-field is level-3 "### " or deeper — never promote a block, an FR sub-field, or a template field to "## ".
- DENSITY: write tight, prescriptive execution-contract prose. Aim at the block TARGETs, not far beyond them; one line per list item, terse table cells, no padding, hedging, or restatement. Target ~350–500 words per section — the document is a contract, not an essay.`

phase('Draft')
log(`Drafting ${include.length} sections to the template's floors…`)

// Each section runs draft → verify → (one redraft if below floor) independently.
const drafted = await pipeline(
  include,

  // Stage 1 — draft to the floors
  (title) => agent(
    `You are a do:docs section drafter for an ADR + Implementation Spec.
${srcLine(a)}

Draft EXACTLY this section: "${title}".
Open the template at ${a.templatePath}, find the section titled "${title}" (for its blocks and
FLOORS), and follow them exactly — every required list, table (with its named columns), paragraph
count, and fenced block. Floors are minimums; meet them, but stay tight (see DENSITY below).
Head the section "## N. ${renderTitleOf(title)}" using its number from the template${renderTitleOf(title) !== title ? ` (use this specialized title verbatim — it replaces the generic "${title}")` : ''}.

${FORMAT}

Ground every claim in the recon findings (cite file:line / the source). Use the resolved decisions
where the section calls for them.

Recon findings:
${findingsText}

Resolved decisions:
${decisionsText}

Return the section title and its full markdown.`,
    { label: `draft:${title}`, phase: 'Draft', schema: SECTION_DRAFT },
  ),

  // Stage 2 — verify against floors, redraft once if short
  async (draft, title) => {
    if (!draft || !draft.markdown) return { title, markdown: '', verdict: { title, meetsFloors: false, gaps: ['no draft produced'] } }
    const verdict = await agent(
      `You are an adversarial reviewer (plan-skeptic lens). Check ONE drafted section against the template's floors.
TEMPLATE: ${a.templatePath}
SECTION: "${title}"
${SCRATCH}

Open the template, find this section, and verify the draft below meets EVERY floor (list item counts,
table presence + named columns + row counts, paragraph counts, fenced blocks). Be strict: a missing
column or a list under its floor is a gap. Do not reward padding; reward real, grounded content.

Also check the draft uses the heading tokens the scorer keys on: "## N. <Title>" for the section,
a heading with each block's exact title, "- " bullets for lists, GitHub tables with the exact column
names, and "### FR-n" per requirement. Flag any block whose heading/shape would not be detected.

DRAFT:
${draft.markdown}

Return meetsFloors and the named gaps.`,
      { label: `verify:${title}`, phase: 'Verify', schema: VERDICT },
    )
    if (verdict && verdict.meetsFloors) return { title, markdown: draft.markdown, verdict }

    const fixed = await agent(
      `You are the section drafter. Your draft of "${title}" missed these floors:
${verdict ? (verdict.gaps || []).map((g) => `- ${g}`).join('\n') : '- unknown'}

Open the template at ${a.templatePath}, find the section titled "${title}", and REDRAFT it so every
floor is met. Keep the grounded content; add what is missing; stay tight. Head it "## N. ${renderTitleOf(title)}".

${FORMAT}

Recon findings:
${findingsText}

Resolved decisions:
${decisionsText}

Return the section title and its full markdown.`,
      { label: `redraft:${title}`, phase: 'Verify', schema: SECTION_DRAFT },
    )
    return { title, markdown: fixed && fixed.markdown ? fixed.markdown : draft.markdown, verdict: verdict || { title, meetsFloors: false, gaps: [] } }
  },
)

phase('Assemble')
// Within one section, only the first "## " line is the section heading; demote any later
// "## " (a drafter that promoted a block/field) to "### " so the doc keeps one heading level.
function demoteStrayH2(md) {
  let seen = false
  return md.split('\n').map((line) => {
    if (/^## /.test(line)) { if (!seen) { seen = true; return line } return '#' + line }
    return line
  }).join('\n')
}
const byTitle = new Map(drafted.filter(Boolean).map((d) => [d.title, d]))
const orderedSections = include.map((t) => (byTitle.get(t) || { title: t, markdown: `## ${t}\n\n(_section not produced_)` }))

const titleBlock = [
  `# ADR ${a.version || 'v1'}`,
  `${a.product || '<Product>'} ${a.subject || ''} Implementation Specification`.trim(),
  ``,
  `_Single source of truth for completing the ${a.product || '<product>'} product_`,
  ``,
  `- **Date:** ${a.sourceGeneratedAt || '<date>'}`,
  `- **Status:** Accepted for implementation planning`,
  ``,
  `| Field | Value |`,
  `| --- | --- |`,
  `| Document status | Accepted for implementation planning |`,
  `| ADR decision | See §4 |`,
  `| Source report | ${a.sourceReportId || 'none — direct recon'} |`,
  `| Source generated at | ${a.sourceGeneratedAt || '<date>'} |`,
  `| Source confidence | ${a.confidence || 'medium'} |`,
  `| Primary repository | ${a.primaryRepository || '<owner/repo>'} |`,
  `| Primary audience | Distinguished engineer, system engineer, feature owners, test/release owners |`,
].join('\n')

const markdown = `${titleBlock}\n\n${orderedSections.map((s) => demoteStrayH2(s.markdown.trim())).join('\n\n')}\n`

const openGaps = drafted
  .filter(Boolean)
  .filter((d) => d.verdict && !d.verdict.meetsFloors)
  .map((d) => ({ title: d.title, gaps: d.verdict.gaps || [] }))

log(`Assembled ${orderedSections.length} sections. ${openGaps.length} still below floor.`)

return {
  markdown,
  sections: drafted.filter(Boolean).map((d) => ({ title: d.title, meetsFloors: !!(d.verdict && d.verdict.meetsFloors) })),
  openGaps,
}
