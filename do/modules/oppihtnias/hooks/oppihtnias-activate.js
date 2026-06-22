#!/usr/bin/env node
// SessionStart (oppihtnias module): where the module is installed, seed/announce the
// per-session oppihtnias. Self-gates on the project manifest -> a no-op everywhere the
// module is not enabled. Fail-open: any error -> silent exit 0 (never blocks a session).
const fs = require("node:fs");
const path = require("node:path");

try {
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const manifestPath = path.join(projectDir, ".claude", "do.manifest.json");
  if (!fs.existsSync(manifestPath)) process.exit(0);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (!(manifest.modules || []).includes("oppihtnias")) process.exit(0);

  const sid = process.env.CLAUDE_CODE_SESSION_ID || "";
  let where = ".claude/state/oppihtnias/<session-id>.json";

  if (sid) {
    const dir = path.join(projectDir, ".claude", "state", "oppihtnias");
    const modelPath = path.join(dir, `${sid}.json`);
    where = modelPath.replace(/\\/g, "/");
    if (!fs.existsSync(modelPath)) {
      fs.mkdirSync(dir, { recursive: true });
      const now = new Date().toISOString();
      const skeleton = {
        id: `mm_${sid.slice(0, 8)}`,
        mode: "simple",
        provenance: { sessionId: sid, createdAt: now, updatedAt: now, createdBy: "agent", schemaVersion: "3.0.0", revision: 0 },
        core: { originalInput: { raw: "", receivedAt: now }, goal: "", acceptanceCriteria: [], tasks: [] },
      };
      fs.writeFileSync(modelPath, JSON.stringify(skeleton, null, 2));
    }
  }

  process.stdout.write(
    `OPPIHTNIAS active — keep the per-session model at ${where} current (schema: .claude/do/oppihtnias/Oppihtsugatnias.ts). ` +
    `Each gated turn update core.originalInput (verbatim) / goal / acceptanceCriteria / tasks and bump provenance.revision. Advisory — nothing blocks on it.`
  );
} catch {
  process.exit(0);
}
