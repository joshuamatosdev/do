#!/usr/bin/env node
// plain-words.js — advisory plain-language checker for do prose.
//
// Reports words that are NOT in the google-10000-english list and NOT in the
// technical-term allowlist. Advisory by design: it never fails the build; it
// gives authors (and the plainify workflow) a target list to simplify.
//
//   node tools/plain-words.js <file...>     # check named files
//   node tools/plain-words.js --all         # check the shipped do prose set
//   node tools/plain-words.js --all --json  # machine-readable totals
//
// A word "passes" if it (or a light de-inflected form) is in the common list,
// or it is an allowed technical term / proper noun. Tokens with digits or
// internal capitals (identifiers, ALL-CAPS acronyms, CamelCase) are skipped —
// they are code-ish, not ordinary prose.

const fs = require("node:fs");
const { join } = require("node:path");

const LIST = new Set(
  fs.readFileSync(join(__dirname, "wordlist", "google-10000-english.txt"), "utf8")
    .split(/\r?\n/).map((w) => w.trim().toLowerCase()).filter(Boolean)
);

// Technical terms + proper nouns kept by judgment — they carry meaning a common
// word cannot. This is the "some will remain, such as SOLID" allowlist.
const ALLOW = new Set([
  // brand / tools / models
  "doctrineone", "claude", "anthropic", "codex", "sonnet", "opus", "haiku",
  "superpowers", "coderabbit", "vite", "tanstack", "spring", "modulith",
  "keycloak", "flyway", "orval", "dagster", "ttx", "github", "gitlab",
  // acronyms / formats
  "solid", "tdd", "bdd", "mdmp", "ipoe", "api", "cli", "json", "yaml", "toml", "sql",
  "url", "uri", "pii", "ux", "ui", "http", "https", "rls", "guc", "oid4vp", "oid4vci",
  "sha", "ascii", "kebab", "regex", "stdin", "stdout", "env", "vc",
  // engineering vocabulary with no common equivalent
  "idempotent", "idempotency", "manifest", "schema", "schemas", "migration", "migrations",
  "plugin", "plugins", "hook", "hooks", "subagent", "subagents", "orchestrate",
  "orchestration", "orchestrator", "scaffold", "frontmatter", "backtick", "backticks",
  "checksum", "checksums", "tokenize", "config", "configs", "metadata", "namespace",
  "runtime", "filesystem", "validator", "lint", "linter", "tooling", "adversarial",
  "dedupe", "deduplicate", "transitive", "inflection", "deinflect", "vendored",
  // workflow vocabulary (kept in allowlist — appear in workflow prose)
  "doctrine", "doctrines", "ladder", "spine", "module", "modules", "gate", "gates",
  "handoff", "triage", "brainstorming", "provenance", "ceremony", "intake",
  // technical terms with no plain equivalent (NOT rewrite targets)
  "git", "repo", "repos", "fetch", "endpoint", "endpoints", "frontend", "backend",
  "auth", "authz", "deps", "observability", "rollback", "backfill", "unauthenticated",
  "regenerate", "regenerated", "regenerating", "dashboard",
  // accepted survivors of the plainify pass — technical / proper / workflow vocabulary kept by judgment
  "agnostic", "dependency", "dependencies", "watchlist", "inability", "rerun", "slug",
  "deterministic", "severity", "verbatim", "slice", "slices", "carriage", "degradation",
  "drift", "stub", "glob", "allowlist", "matos", "bash", "paperwork",
  // do-compress module vocabulary
  "caveman", "compress", "compression",
  // do-style / workflow vocabulary
  "invariant", "invariants", "lifecycle", "auditability", "telemetry", "deploy", "debug", "debugged",
  // bug-hunting + testing vocabulary (do:bug-runtime / do:bug-static)
  "flaky", "repro", "concurrent", "concurrency", "mismatch", "mismatches", "unhandled",
  "mutation", "malformed", "assertion", "mocks", "lockfile", "lockfiles", "unchecked",
  "leaks", "parsing", "persistence", "async", "serialization", "deserialization",
  "propagation", "dereferenced", "unwrapped", "epoch", "arithmetic", "deprecated",
  "checkers", "refactor", "refactors", "artifact", "artifacts", "timeout", "swallowed",
  "inspect", "inconsistent", "widen", "stale", "risky", "unsafe", "misuse", "spotting",
  "timezone", "inverted",
  // commit / pipeline vocabulary (do:commit)
  "bypass", "bypassed", "bypassing", "retry", "formatter", "reformat", "reformatted",
  "reformatting", "reformats", "defect", "daemon", "infra", "untracked", "uncommitted",
  "atomically", "auditable", "flake", "increment", "fallback", "classify", "emit",
  "categorize", "unstaged", "pinned", "append", "unfixed", "obstacles", "absorb",
  // docs vocabulary (do:docs)
  "unverified", "callers", "invent", "invents", "contradict", "concise", "swapped", "clever",
  // security vocabulary — no plain equivalent (do:security-recon, red-blue-sweep)
  "bug-bounty", "bounty", "exhaustion", "credential", "credentials", "recon", "remediation", "remediated",
  "bugcrowd", "hypotheses", "destructive", "ransomware", "malware", "phishing",
  "exfiltration", "reproducible", "untrusted", "idiomatic", "simulate", "authenticated",
  "escalation", "dataset", "loopback", "lateral", "fuzzing", "exploit", "exploitable",
  "exploitation", "leakage", "tampering", "fixation", "replay", "redacted", "rotate",
  "anon", "redirects", "webhooks", "insecure", "vishing", "smishing", "pretexting",
  "impersonation", "backdoors", "sandbox", "sandboxes", "parameterized", "sanitized",
  "retest", "invocation", "supervised", "plausible", "lawful", "wipe", "clarify", "sweep",
  "cyan", // standard agent color value in do: agent frontmatter
  // security tool names (proper nouns, no plain equal)
  "nmap", "gobuster", "feroxbuster", "ffuf", "nuclei", "katana", "sqlmap", "nikto",
  "hydra", "wfuzz", "whatweb", "hashcat", "curl",
  // genuinely-technical terms / proper nouns kept (no plain equal)
  "linters", "parse", "parses", "codebase", "gradle",
  // report-engine vocabulary (report-writing skill, do report engine)
  "payload", "payloads", "preset", "presets", "markdown", "determinism", "fixture",
  "fixtures", "rollout",
  // grounded-docs / doc-index vocabulary (grounded-docs skill, grounded-docs scaffold)
  "lexical", "semantic", "chunk", "chunks", "chunking", "embedding", "embeddings",
  "embeds", "traceable", "pinning", "sidecar", "scaffolding", "quickstart",
  // ADR / architecture-record vocabulary (adr skill)
  "adr", "bootstrap", "bootstraps", "reconnaissance", "canonical", "axes", "justified",
  "prose", "synthesize", "synthesis", "initializing", "reinitializing", "ambiguous",
  "unrelated", "superseded", "supersede", "entrypoints", "upstream", "downstream",
  "authn", "adapt", "reused", "hardened", "coherent", "semantics", "supportability",
  "deprecation", "speculative", "someday", "deferring", "revisit", "unintended",
  "rebranding", "leaked", "summarize",
  // adr spec-mode vocabulary (single ADR + Implementation Spec, interactive + yolo)
  "rubric", "rubrics", "traceability", "deliverable", "deliverables", "completeness",
  "selectable", "resumable", "yolo", "distill", "distilled", "redraft", "redrafts",
  "enforceable", "autonomous", "gitignore", "gitignored", "unspecified",
  // model proper nouns surfaced as spec examples
  "gemma", "copilot",
  // imported engineering skills (commit-skeptic, plan-skeptic, codebase-cartography, user-value-chain)
  "skeptic", "cartography", "verdict", "symptom", "observable", "adversarially",
  "creep", "crept", "correctness", "retries", "skeleton", "stubs", "abstention",
  "untestable", "testable", "placeholder", "placeholders", "chore", "grep", "leak",
  "mermaid", "topology", "monorepo", "handlers", "inbound", "outbound", "subtrees",
  "resolvers", "middleware", "rust", "linting",
  // tech / product proper nouns surfaced by cartography
  "kafka", "redis", "valkey", "feign", "retrofit", "axios",
  // imported security skills — vuln classes, payloads, hunting method, triage gate (authorized testing)
  "vuln", "params", "param", "takeover", "subdomain", "subdomains", "dorks", "taint",
  "gadget", "escalate", "escalating", "webhook", "wildcard", "webapp", "wordlist",
  "wordlists", "fuzz", "redirect", "clickjacking", "exfil", "exfils", "hijack",
  "hijacking", "introspection", "deduplication", "credentialed", "bucket", "hex",
  "octal", "unicode", "cyrillic", "parser", "parsers", "polyglot", "rebinding",
  "smuggling", "misconfig", "misconfigs", "agentic", "chatbot", "hostname",
  "backslash", "spoof", "spoofing", "prepend", "propagate", "interpreter", "referrer",
  "payout", "fingerprints", "fingerprinting", "blob", "sanitize", "sanitization",
  "priv", "esc", "authed", "reflective", "brute", "callback", "deployed", "inject",
  "injecting", "injected", "stripping", "triager", "normalize", "truncate", "arsenal",
  "obfuscate", "obfuscation", "bypasses",
  // red-blue orchestrator skill — agent-team vocabulary + red/blue terms
  "spawn", "spawns", "teammate", "teammates", "attackers", "defenders", "harden",
  "hardening", "orchestrated", "weaponize", "tmux", "intra", "lever", "critic",
  "exploitability",
  // security tool + product proper nouns
  "burp", "caido", "httpx", "dalfox", "interactsh", "jsluice", "subfinder", "dnsx",
  "wscat", "ghauri", "jira", "firebase", "stripe", "salesforce", "vercel", "coinbase",
  "azure", "jinja", "flask", "twig", "symfony", "freemarker", "thymeleaf", "tomnomnom",
  "kettle",
]);

function deinflect(w) {
  const f = new Set([w]);
  const add = (s) => { if (s.length >= 2) f.add(s); };
  if (w.endsWith("s")) add(w.slice(0, -1));
  if (w.endsWith("es")) add(w.slice(0, -2));
  if (w.endsWith("ies")) add(w.slice(0, -3) + "y");
  if (w.endsWith("ed")) { add(w.slice(0, -2)); add(w.slice(0, -1)); }
  if (w.endsWith("ing")) { add(w.slice(0, -3)); add(w.slice(0, -3) + "e"); }
  if (w.endsWith("ly")) add(w.slice(0, -2));
  if (w.endsWith("er")) { add(w.slice(0, -2)); add(w.slice(0, -1)); }
  if (w.endsWith("est")) add(w.slice(0, -3));
  return [...f];
}

function isCommon(w) {
  if (ALLOW.has(w)) return true;
  return deinflect(w).some((form) => LIST.has(form));
}

function proseOf(text) {
  return text
    .replace(/```[\s\S]*?```/g, " ")          // fenced code blocks
    .replace(/`[^`]*`/g, " ")                  // inline code
    .replace(/https?:\/\/\S+/g, " ")           // URLs
    .replace(/\$\{[^}]*\}/g, " ")              // ${VARS}
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")   // links: keep text, drop target
    .replace(/\S*[\/\\.]\S*[\/\\.]\S*/g, " ")  // path-ish / dotted identifiers
    .replace(/<!--[\s\S]*?-->/g, " ");         // html comments / delimiters
}

function passesPlain(w) {
  if (w.length < 3) return true; // tiny words (to, of, ui) are not worth flagging
  return isCommon(w);
}

// A token passes if: it's a common/allowed plain word; OR a hyphen compound whose
// every part passes (high-stakes, end-to-end, do-plan); OR a contraction whose
// stem passes (don't -> do, what's -> what, can't -> can).
function passes(w) {
  if (w.includes("-")) return w.split("-").every((p) => p === "" || passesPlain(p));
  if (w.includes("'")) {
    const stem = w.split("'")[0];
    return passesPlain(w) || passesPlain(stem) || passesPlain(stem.replace(/n$/, ""));
  }
  return passesPlain(w);
}

function rareWords(file) {
  const tokens = proseOf(fs.readFileSync(file, "utf8")).match(/[A-Za-z][A-Za-z'-]*/g) || [];
  const rare = new Map();
  for (const t of tokens) {
    if (/\d/.test(t)) continue;                 // has a digit -> identifier
    if (/[A-Z]/.test(t.slice(1))) continue;     // internal capital -> CamelCase / ACRONYM
    const w = t.toLowerCase().replace(/^['-]+|['-]+$/g, "");
    if (!w || passes(w)) continue;
    rare.set(w, (rare.get(w) || 0) + 1);
  }
  return [...rare.entries()].sort((a, b) => b[1] - a[1]);
}

const PROSE = [
  "README.md", "CLAUDE.md",
  "skills/setup/SKILL.md",
  ...["setup", "status", "add", "update", "execute", "review", "verify", "handoff"]
    .map((s) => `skills/setup/references/${s}.md`),
  "do/spine/RESPONSE-FORMAT.md",
  "do/spine/CLAUDE.do.md",
  "do/spine/one.md",
  "do/modules/completion-gates/gates.md",
  "do/modules/codex-integrity/format-note.md",
  "do/modules/oppihtnias/format-note.md",
  "do/modules/memory-discipline/format-note.md",
  "do/modules/memory-discipline/MEMORY.template.md",
  "do/modules/memory-discipline/skills/do-remember/SKILL.md",
  "skills/setup/references/compress.md",
  "skills/compress/SKILL.md",
  "skills/style/SKILL.md",
  "skills/setup/references/style.md",
  "skills/adr/SKILL.md",
  "skills/report-writing/SKILL.md",
  "skills/report-writing/scripts/report-engine/README.md",
  "skills/grounded-docs/SKILL.md",
  "lib/grounded-docs-scaffold/README.md",
  // imported skills — engineering skeptics + cartography + value chain
  "skills/commit-skeptic/SKILL.md",
  "skills/plan-skeptic/SKILL.md",
  "skills/codebase-cartography/SKILL.md",
  "skills/user-value-chain/SKILL.md",
  // imported security skills (authorized testing) — bug-bounty method, triage gate, vuln + payload references, red-blue orchestration
  "skills/bb-methodology/SKILL.md",
  "skills/security-arsenal/SKILL.md",
  "skills/red-blue/SKILL.md",
];

function resolveTargets(args) {
  if (args.includes("--all")) {
    const root = join(__dirname, "..");
    const listed = PROSE.map((p) => join(root, p));
    // Every agent is shipped do prose; cover the whole agents/ dir so new
    // agents are checked without editing the list each time.
    const agentsDir = join(root, "agents");
    const agents = fs.existsSync(agentsDir)
      ? fs.readdirSync(agentsDir).filter((f) => f.endsWith(".md")).sort().map((f) => join(agentsDir, f))
      : [];
    return [...listed, ...agents].filter((p) => fs.existsSync(p));
  }
  return args.filter((a) => !a.startsWith("--"));
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const targets = resolveTargets(args);
  const report = targets.map((file) => ({ file, rare: rareWords(file) }));
  const total = report.reduce((n, r) => n + r.rare.length, 0);
  if (asJson) {
    console.log(JSON.stringify({ total, files: report.map((r) => ({ file: r.file, rareCount: r.rare.length, rare: r.rare })) }, null, 2));
  } else {
    for (const r of report) {
      console.log(`\n${r.file} — ${r.rare.length} uncommon word(s)`);
      if (r.rare.length) console.log("  " + r.rare.map(([w, c]) => `${w}(${c})`).join(" "));
    }
    console.log(`\nTOTAL uncommon (excl. allowlist + identifiers): ${total}`);
  }
}

module.exports = { rareWords, isCommon, PROSE };
