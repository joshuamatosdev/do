---
name: codebase-cartography
description: Map any codebase from its folder structure and file contents to a set of architecture diagrams and a structured report. Identifies the tech stack, bounded contexts, layer boundaries, data flows, and integration points, and outputs both ASCII box-drawing and Mermaid diagrams. Read-only — not for code review, linting, or changing code. Use to get up to speed on a repo you do not know, document a system, or check whether the real structure matches the intended one. Triggers on "map this codebase", "draw the architecture", "what does this repo look like", or "/codebase-cartography".
allowed-tools: Read, Grep, Glob
---

# codebase-cartography

Map a codebase as it really is — structure, boundaries, and flows — and draw it. This skill is
**read-only**: it describes structure, it never changes code, and it stays out of code review,
linting, and style. It pairs with the `do:review` and `do:engineer` agents (which judge and shape
code) by giving them the map to work from. It runs with standard read and search tools only; one
optional helper script accelerates Step 2 (`scripts/map_codebase_structure.py`) but is never required.

## Workflow

Follow these five steps in order. Do not skip them or change their order.

### Step 1 — Establish boundaries

Work out the codebase's shape before reading any source.

1. Read the top-level directory listing (one level deep).
2. Read the build and config files to name the tech stack and build system (e.g. `package.json`,
   `build.gradle`, `go.mod`, `pyproject.toml`, `Cargo.toml`).
3. Classify the repo type:
   - **Monorepo:** many project files in nested folders.
   - **Single repo:** one project root.
   - **Hybrid:** shared libraries plus independent services.
4. Read `README.md`, `CLAUDE.md`, `AGENTS.md`, or any top-level doc that states architecture intent.
5. Read the CI/CD and deploy config (`.github/workflows/`, `Jenkinsfile`, `.gitlab-ci.yml`,
   `Dockerfile`, `docker-compose.yml`) to see the deploy shape.

**Output:** a tech-stack summary, the repo type, and a list of top-level modules or services to
explore in depth.

### Step 2 — Map the topology

Build a directory map by hand with glob patterns and directory reads. Skip vendored and build trees
(`node_modules`, `.git`, `build`, `dist`, `target`, `.next`, `__pycache__`, `.gradle`):

- `**/*.{ts,tsx,js,jsx}` for JS / TS projects
- `**/*.{java,kt}` for JVM projects
- `**/*.py` for Python projects
- `**/*.go` for Go projects
- `**/*.rs` for Rust projects

For each significant directory, record the file count, the rough line count, the main language, and
any framework markers (controllers, routes, models, migrations).

**Optional accelerator:** when Python is available, `python ${CLAUDE_SKILL_DIR}/scripts/map_codebase_structure.py <root>
[--depth N] [--exclude a,b]` emits this map as JSON (per-directory file/line counts, language stats,
framework markers, and a top-level summary) — it already skips vendored and build trees. Treat its
output as the raw topology, then continue with Steps 3–5 by hand. It is an accelerator, not a
requirement: if Python is absent or the run fails, build the map with glob and directory reads as above.
The skill's `allowed-tools` grant Read/Grep/Glob only, so running the Python accelerator prompts for
Bash once — intentional for a read-only skill.

**Output:** a directory map with those annotations.

### Step 3 — Classify components

Read source files and classify each module or directory by its architectural role:

| Role                   | Indicators                                                                    |
| ---------------------- | ----------------------------------------------------------------------------- |
| **Domain / Core**      | Models, entities, value objects, domain events; no framework imports          |
| **Application**        | Use cases, commands, queries, orchestration; imports domain only              |
| **Adapter (inbound)**  | Controllers, REST endpoints, GraphQL resolvers, CLI handlers, queue consumers |
| **Adapter (outbound)** | Repository implementations, API clients, message producers, file writers      |
| **Infrastructure**     | Config, dependency injection, middleware, logging, security filters           |
| **Presentation**       | UI components, pages, layouts, views, templates                               |
| **Shared / Lib**       | Utilities, types, and contracts shared across modules                         |

Read the entry points first — route definitions, controllers, handlers, `main` files, index files.
Then identify bounded contexts by looking for database-schema ownership (migrations, entity
annotations), message-topic ownership (producer / consumer patterns), API boundary definitions
(OpenAPI specs, route prefixes), and module-isolation mechanisms (barrel exports, package-private
visibility, boundary rules).

**Output:** a component classification table and a bounded-context map.

### Step 4 — Detect data flows

Trace how data moves from entry to storage to external systems.

1. List all entry points (HTTP routes, message consumers, scheduled tasks, CLI commands).
2. For each, trace the call chain:
   `entry -> service / use-case -> domain logic -> storage / messaging -> external`.
3. Identify integration points:

| Type                | What to look for                                                     |
| ------------------- | -------------------------------------------------------------------- |
| **Database**        | Connection strings, ORM config, migration files, repository patterns |
| **Messaging**       | Kafka / RabbitMQ / SQS topics, producer and consumer classes         |
| **HTTP (outbound)** | API clients, generated clients, Feign / Retrofit / Axios usage       |
| **File I/O**        | Object-store clients, upload handlers, export services               |
| **Cache**           | Redis / Valkey / in-memory cache config and annotations              |
| **Auth**            | OAuth / OIDC config, identity-provider integration, token checks     |

4. For event-driven systems, map the event flow:
   `producer -> topic / queue -> consumer -> projection / side effect`.

**Output:** data-flow traces and an integration-point inventory.

### Step 5 — Produce diagrams and the report

Produce each diagram in **both** formats — ASCII box-drawing and Mermaid — so it reads in plain text
and renders in a viewer.

Diagrams to produce:

1. **System context** — the system, its users and actors, and its external dependencies. Always.
2. **Container** — services, databases, brokers, caches, and their links. Always.
3. **Component** — the internal structure of each significant service or module.
4. **Data flow** — how data enters, transforms, is stored, and exits.
5. **Deploy topology** — the infrastructure layout, when deploy config exists.

Rules for diagrams:

- Every box must map to evidence found in the code.
- Mark guessed relationships with `[inferred]` or a dashed line; show observed ones with a solid line.
- Use the real directory, class, and file names.
- Group by bounded context where it applies.
- Show direction with arrows (`->` means "depends on" or "calls").

**Report structure** — write these sections in order; do not drop one, write "Not applicable" with a
reason instead:

1. Summary — tech stack, repo type, headline findings.
2. Topology — the annotated directory map.
3. Components — the classification table and bounded-context map.
4. Data flows — the traces and integration-point inventory.
5. Diagrams — the five diagrams, each in ASCII and Mermaid.
6. Structural findings — issues found, with severity (see below).
7. Coverage — which subtrees were analyzed in full, which were sampled, which were left out.

Return the report inline. Write it to a file only when the user asks where to put it.

## Hard rules

1. Never invent components, services, or links not evidenced in the code.
2. Never change source files — this skill is read-only.
3. Never guess at business logic — describe structure, not intent.
4. Always tell observed (solid) from guessed (dashed) relationships.
5. Always name the tech stack from config before reading source — it guides what patterns to expect.
6. Never widen scope into code review, linting, or style.
7. When a codebase is too large for full analysis, state which subtrees were analyzed and which were
   sampled or left out.

## Severity of structural findings

If the map reveals architectural problems, classify them:

| Severity     | Definition                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------- |
| **critical** | Circular dependencies between bounded contexts; the domain layer importing infrastructure; read and write paths not separated where the design says they should be |
| **high**     | Deep cross-module imports that skip the public API; shared state changed across service boundaries; raw SQL in controllers (no storage layer) |
| **medium**   | Inconsistent layering across modules; mixed responsibilities in one directory; naming drift between similar modules |
| **low**      | Minor organization mismatches; dead directories; naming preferences                                                 |

Raise the severity when a pattern is structural, repeated, or affects shared code.
