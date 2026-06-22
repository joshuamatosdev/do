### Feature Completion Evidence Gates (completion-gates module)

Check each, assign an owner, note the evidence, mark **Complete** / **N/A (with evidence)** / **Remaining**.

**Schema / Database**

- Every schema/migration/seed/index/constraint/reference-data change **applied to the live dev DB**, not just committed.

- Verification includes a live query result, run as the correct runtime role (prove the role via the DB's own session identity — not an admin/superuser/policy-bypassing account).

- Changed tables, indexes, constraints, defaults, grants, and owners verified via the DB's own catalog (live).

- Both fresh-create **and** existing-upgrade paths considered; if one path is not tested, say why + what remains.

- If data is access-scoped, prove positive access (the owner sees its own rows), negative access (another scope can not), cross-scope write fails, and missing-context fails closed.

- Risky/backfill changes → row counts, null-or-not/backfill order, idempotent-rerun proof, rollback notes, explicit user approval for data loss.

**Security / Auth**

- Every "N/A" security item names the checked files/docs justifying it.

- New/changed routes → negative matcher tests: wrong method, adjacent path, wrong role, unauthenticated, catch-all ordering.

- Public routes proven on purpose (explicit note/manifest entry, public namespace, public DTOs/datasource).

- Role/grant audit proves no application login is an administrative/superuser/policy-bypassing/replication account.

- Authz events (allow **and** deny) carry correlationId, principal, action, resource, and a typed result/denial code.

- New config classified secret/non-secret; secrets absent from git, client bundles, log output, and committed docs.

**API / Contract**

- Every contract change (path/schema/status/security) reviewed **before** regenerating any client.

- New/changed endpoints have stable explicit operation IDs.

- Frontend uses the generated API client — not a hand-written fetch.

- The OpenAPI/contract spec + generated client regenerated after a contract change; generated diffs reported.

- Contract tests: success, validation error, authz fail, not-found, conflict, and the problem/error shape.

- Frontend states: loading, empty, success, validation error, forbidden, unauthenticated, not-found, conflict, network/server error.

- E2E uses real auth/session and seeded data.

**Operations / Evidence**

- Any schema/config/env/auth/role/feature-flag/generated-client/route change states which services were stopped and started again (or why none needed).

- Local verification mirrors CI gates, or cites the CI jobs that covered it.

- Completion includes a command-evidence matrix naming the exact commands run.

- State-changing work includes observability proof: audit/log/metric/span with correlation IDs, no PII.

- DB/config changes include rollback notes.

- Completion includes a `git status --short` check confirming no secrets, logs, build output files, or dependency directories are staged.

These gates apply to FULL-tier turns; mark each Complete / N/A (with evidence) / Remaining.
