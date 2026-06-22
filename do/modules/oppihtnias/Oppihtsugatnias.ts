/**
 * OPPIHTSUGATNIAS (agentic mind-model) — the schema the oppihtnias module maintains per session. Schema 3.0.0.
 *
 * A code-first "mind model" an AI agent holds a unit of work in: a small REQUIRED
 * `core` (the simple case) + optional layers (the scalable / team case) + a typed
 * `extensions` escape hatch — "structure that allows structure and unstructure".
 *
 * 3.0.0 keeps the rich single-root shape of 2.0.0 but makes it SOUND:
 *   - nominal IDs via ONE required `unique symbol` brand — no optional brand, no
 *     `= string` default, so a raw string can't pass as an Id without a constructor;
 *   - JSON-safe `x-*` extensions (was `Record<string, unknown>` → unserializable values);
 *   - `UnitInterval` (0..1) for every confidence;
 *   - discriminated `TaskState` + `CriterionEvaluation` — no illegal status/field combos;
 *   - ONE task topology: flat `parentId` hierarchy + `dependsOn` edges (no recursive
 *     `children`, no second graph in `execution.phases`).
 *
 * The agent keeps `.claude/state/oppihtnias/<session-id>.json` conforming to this.
 * Recreatable from `provenance` + `core`.
 */

// ── nominal brand: one shared unique symbol, REQUIRED ─────────────────────────

declare const brand: unique symbol;

/** Nominal wrapper. The brand property is REQUIRED, so plain values can't slip in. */
export type Brand<T, Name extends string> = T & { readonly [brand]: Name };

/** No default kind: `Id` without an explicit kind is a compile error, not a wildcard. */
export type Id<K extends string> = Brand<string, `id:${K}`>;
export type IsoDateTime = Brand<string, "iso-date-time">;
export type UnitInterval = Brand<number, "unit-interval">; // 0..1

export type ModelId = Id<"model">;
export type TaskId = Id<"task">;
export type CriterionId = Id<"criterion">;
export type EvidenceId = Id<"evidence">;
export type RiskId = Id<"risk">;
export type DecisionId = Id<"decision">;

// boundary constructors — the ONLY way to mint a branded value; validate + rebrand at the edge.
export function parseId<K extends string>(value: string, _kind: K): Id<K> {
  if (value.length === 0) throw new Error(`empty id (${_kind})`);
  return value as Id<K>;
}
export function parseIso(value: string): IsoDateTime {
  if (Number.isNaN(Date.parse(value))) throw new Error(`bad ISO-8601: ${value}`);
  return value as IsoDateTime;
}
export function parseUnit(value: number): UnitInterval {
  if (!(value >= 0 && value <= 1)) throw new Error(`unit interval out of range: ${value}`);
  return value as UnitInterval;
}

// ── JSON-safe, namespaced extensions (structure that allows unstructure) ──────

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

/** Durable, machine-readable, JSON-safe custom state — every key namespaced `x-`. */
export type ExtensionBag = Readonly<Record<`x-${string}`, JsonValue>>;
/** Open enum that keeps literal autocomplete but rejects silent typos (no bare string). */
export type Extensible<T extends string> = T | `x-${string}`;

// ── provenance: recreatable lineage ──────────────────────────────────────────

export interface Provenance {
  sessionId: string;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  createdBy: Extensible<"human" | "agent">;
  schemaVersion: "3.0.0";
  parentId?: ModelId;   // forked/derived-from → recreatable lineage
  revision: number;     // bump on each adaptation
}

// ── REQUIRED CORE ────────────────────────────────────────────────────────────

export interface OriginalInput {
  raw: string;          // exact user text, NEVER paraphrased
  receivedAt: IsoDateTime;
  channel?: string;
  attachments?: readonly { readonly name: string; readonly ref: string }[];
}

/** Criterion DEFINITION; run-side result lives in the discriminated `evaluation`. */
export interface AcceptanceCriterion {
  id: CriterionId;
  statement: string;    // Given-When-Then; provable true/false
  kind: "behavior" | "invariant" | "constraint" | "nonGoal";
  verify?: string;      // command/test that proves it
  evaluation: CriterionEvaluation;
}

export type CriterionEvaluation =
  | { readonly status: "open" }
  | {
      readonly status: "met" | "failed";
      readonly checkedAt: IsoDateTime;
      readonly evidenceRef?: string;   // points into GroundingModel.evidence
      readonly confidence?: UnitInterval;
    }
  | { readonly status: "waived"; readonly waivedAt: IsoDateTime; readonly reason: string };

/** Task DEFINITION; the run-side status lives in the discriminated `state`. */
export interface Task {
  id: TaskId;
  title: string;
  detail?: string;                       // freeform escape hatch for a task
  acceptanceRefs?: readonly CriterionId[];
  parentId?: TaskId;                     // single hierarchy (replaces recursive children)
  dependsOn?: readonly TaskId[];         // single dependency edge set (DAG → safe distribution)
  effort?: "trivial" | "small" | "medium" | "large";
  tier?: Extensible<"haiku" | "sonnet" | "opus">; // model discipline
  priority?: "low" | "normal" | "high" | "urgent";
  artifacts?: readonly string[];
  notes?: readonly string[];
  state: TaskState;
}

export type TaskState =
  | { readonly status: "todo" }
  | { readonly status: "in_progress"; readonly startedAt: IsoDateTime }
  | { readonly status: "blocked"; readonly blockedReason: string }
  | { readonly status: "done"; readonly completedAt: IsoDateTime; readonly outputs?: readonly string[] }
  | { readonly status: "dropped"; readonly reason?: string };

export interface CoreTaskModel {
  originalInput: OriginalInput;              // the user's original input, verbatim
  goal: string;                              // one sentence
  acceptanceCriteria: readonly AcceptanceCriterion[];
  tasks: readonly Task[];                    // flat list; hierarchy via parentId
}

// ── OPTIONAL LAYERS (the scalable case) ──────────────────────────────────────

export interface ContextModel {
  workspace?: string;
  relevantFiles?: readonly string[];
  facts?: readonly string[];
  assumptions?: readonly string[];
  unknowns?: readonly string[];          // open questions still unresolved
  nonGoals?: readonly string[];          // explicitly out of scope
  constraints?: readonly string[];       // hard limits: time, deps, policy, budget
  references?: readonly { readonly label: string; readonly ref: string }[];
}

export type EvidenceSource = "user" | "file" | "test" | "tool" | "inference";

export interface Evidence {
  id: EvidenceId;
  claim: string;
  source: EvidenceSource;       // belief vs verified fact
  ref?: string;                 // file:line, command, url
  confidence?: UnitInterval;    // 0..1
  lastVerifiedAt?: IsoDateTime;
}

export interface GroundingModel {
  evidence: readonly Evidence[];
}

export interface EnvSnapshot {
  repoPath?: string;
  branch?: string;
  commit?: string;
  dirtyWorktree?: string;       // `git status --short` summary
  toolVersions?: Readonly<Record<string, string>>;
  filesTouched?: readonly string[];
  capturedAt: IsoDateTime;
}

export interface AuthorityModel {
  requested: readonly string[];          // what the user explicitly asked for
  mayChange?: readonly string[];         // surfaces the agent is allowed to edit
  requiresConfirmation?: readonly string[];
  neverChange?: readonly string[];       // invariants / off-limits surfaces
}

export interface Risk {
  id: RiskId;
  statement: string;            // what must not break
  severity: "low" | "medium" | "high";
  mitigation?: string;
}

export interface Decision {
  id: DecisionId;
  choice: string;
  rationale: string;
  alternatives?: readonly string[];
  supersedes?: DecisionId;
  reversible: boolean;
  rollbackPlan?: string;
  revisitWhen?: string;
  at: IsoDateTime;
}

export interface Checkpoint {
  revision: number;
  at: IsoDateTime;
  ref: string;                  // hash or inline snapshot
  reason?: string;
}

/** No `phases` here — task ordering is the single `parentId`/`dependsOn` graph. */
export interface ExecutionModel {
  strategy?: string;
  risks?: readonly Risk[];
  decisions?: readonly Decision[];
  checkpoints?: readonly Checkpoint[];
}

export interface Assignee {
  kind: "self" | "subagent" | "human" | "team";
  name?: string;
  capabilities?: readonly string[];
}

export interface Handoff {
  from: Assignee;
  to: Assignee;
  taskRefs: readonly TaskId[];
  brief: string;
  at: IsoDateTime;
}

export interface DelegationModel {
  workstreams?: readonly { readonly name: string; readonly owner: Assignee; readonly taskRefs: readonly TaskId[] }[];
  agentRoles?: readonly { readonly role: string; readonly assignee: Assignee }[];
  handoffs?: readonly Handoff[];
  mergePlan?: string;
  communicationPolicy?: string;
}

export interface VerificationRun {
  at: IsoDateTime;
  ran: string;
  passed: boolean;
  output?: string;
  criterionRefs?: readonly CriterionId[];
}

export interface VerificationModel {
  plan?: string;
  commands?: readonly string[];
  expectedSignals?: readonly string[];
  manualChecks?: readonly string[];
  residualRisk?: string;
  runs?: readonly VerificationRun[];
}

export interface ContinuationModel {
  continuationSummary?: string; // compaction-surviving précis
  currentState?: string;
  nextBestAction?: string;
  blockedOn?: string;
  metrics?: {
    readonly tokensSpent?: number;
    readonly tasksDone?: number;
    readonly tasksTotal?: number;
    readonly criteriaMet?: number;
    readonly criteriaTotal?: number;
    readonly confidence?: UnitInterval;
  };
}

export interface Lifecycle {
  phase: "draft" | "active" | "shipping" | "watching" | "rollback" | "retired";
  rollbackPlan?: string;
  observability?: readonly string[];
  retirement?: string;
}

// ── THE ROOT — core required, every layer optional ───────────────────────────

export type MindMode = "simple" | "team" | "distributed";

export interface Oppihtsugatnias {
  id: ModelId;
  provenance: Provenance;
  mode: MindMode;

  core: CoreTaskModel;          // REQUIRED — the simple case

  context?: ContextModel;
  grounding?: GroundingModel;
  environment?: EnvSnapshot;
  authority?: AuthorityModel;
  execution?: ExecutionModel;
  delegation?: DelegationModel;
  verification?: VerificationModel;
  memory?: ContinuationModel;
  lifecycle?: Lifecycle;

  /** Typed, JSON-safe freeform escape hatch — structure that allows unstructure. */
  extensions?: ExtensionBag;
}

// ── minimal valid instance (the simple end — what the seeder writes, typed) ───

export const EXAMPLE_SIMPLE: Oppihtsugatnias = {
  id: parseId("mm_0001", "model"),
  mode: "simple",
  provenance: {
    sessionId: "ab06fe8f",
    createdAt: parseIso("2026-06-19T23:49:46Z"),
    updatedAt: parseIso("2026-06-19T23:49:46Z"),
    createdBy: "agent",
    schemaVersion: "3.0.0",
    revision: 0,
  },
  core: {
    originalInput: { raw: "", receivedAt: parseIso("2026-06-19T23:49:46Z") },
    goal: "",
    acceptanceCriteria: [],
    tasks: [],
  },
};
