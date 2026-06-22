#!/usr/bin/env bash
# create-gh-issues-from-findings.sh — GitHub findings sink for the do agent-team module.
# Files each finding from a neutral findings.json as a GitHub issue (idempotent by a
# `Finding-ID:` line in the body). Requires gh (authenticated) + jq. Outward-facing:
# run with --dry-run first and confirm before filing for real.
set -euo pipefail

FINDINGS_FILE=""
REPO=""
DRY_RUN=false
OUTPUT_FILE=""

usage() {
  cat <<'EOF'
Usage:
  bash .claude/skills/do-team/scripts/create-gh-issues-from-findings.sh --findings <file.json> [--repo owner/name] [--output file.json] [--dry-run]

Options:
  --findings   Path to findings JSON file (required)
  --repo       GitHub repository (owner/name). Defaults to current gh repo.
  --output     Optional JSON report path (created/skipped/errors).
  --dry-run    Print planned issues without creating them.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --findings)
      FINDINGS_FILE="${2:-}"
      shift 2
      ;;
    --repo)
      REPO="${2:-}"
      shift 2
      ;;
    --output)
      OUTPUT_FILE="${2:-}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "ERROR: Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -z "${FINDINGS_FILE}" ]]; then
  echo "ERROR: --findings is required." >&2
  exit 1
fi

if [[ ! -f "${FINDINGS_FILE}" ]]; then
  echo "ERROR: Findings file not found: ${FINDINGS_FILE}" >&2
  exit 1
fi

for tool in gh jq; do
  if ! command -v "${tool}" >/dev/null 2>&1; then
    echo "ERROR: ${tool} is required." >&2
    exit 1
  fi
done

if ! gh auth status >/dev/null 2>&1; then
  echo "ERROR: gh is not authenticated. Run: gh auth login" >&2
  exit 1
fi

if [[ -z "${REPO}" ]]; then
  REPO="$(gh repo view --json nameWithOwner --jq '.nameWithOwner')"
fi

if ! jq -e '
  type == "object"
  and (.findings | type == "array")
' "${FINDINGS_FILE}" >/dev/null; then
  echo "ERROR: findings file must be a JSON object containing a findings array." >&2
  exit 1
fi

ensure_label() {
  local name="$1"
  local color="$2"
  local description="$3"
  if [[ "${DRY_RUN}" == "true" ]]; then
    echo "DRY-RUN: would ensure label: ${name}"
    return 0
  fi
  if ! gh label list --repo "${REPO}" --limit 2000 --json name --jq '.[].name' | grep -Fxq "${name}"; then
    gh label create "${name}" --repo "${REPO}" --color "${color}" --description "${description}" >/dev/null || true
  fi
}

ensure_label "security-finding" "B60205" "Automated security finding"
ensure_label "severity:critical" "B60205" "Critical security severity"
ensure_label "severity:high" "D93F0B" "High security severity"
ensure_label "severity:medium" "FBCA04" "Medium security severity"
ensure_label "severity:low" "0E8A16" "Low security severity"

created=0
skipped=0
errors=0
RESULTS_FILE="$(mktemp)"
trap 'rm -f "${RESULTS_FILE}"' EXIT

rows=(); while IFS= read -r row; do rows+=("$row"); done < <(jq -c '.findings[]' "${FINDINGS_FILE}")

if [[ "${#rows[@]}" -eq 0 ]]; then
  echo "No findings found in: ${FINDINGS_FILE}"
  exit 0
fi

for row in "${rows[@]}"; do
  id="$(jq -r '.id' <<<"${row}")"
  title_raw="$(jq -r '.title' <<<"${row}")"
  severity="$(jq -r '.severity | ascii_downcase' <<<"${row}")"
  team="$(jq -r '.team' <<<"${row}")"
  category="$(jq -r '.category' <<<"${row}")"
  summary="$(jq -r '.summary' <<<"${row}")"
  impact="$(jq -r '.impact' <<<"${row}")"
  remediation="$(jq -r '.remediation' <<<"${row}")"

  if [[ -z "${id}" || "${id}" == "null" ]]; then
    echo "WARN: skipping finding with empty id"
    skipped=$((skipped + 1))
    echo '{"id":"","status":"skipped","reason":"missing-id"}' >> "${RESULTS_FILE}"
    continue
  fi

  if [[ ! "${id}" =~ ^[A-Za-z0-9_-]+$ ]]; then
    echo "WARN: skipping finding with unsafe id: ${id}"
    skipped=$((skipped + 1))
    jq -n --arg id "${id}" '{"id":$id,"status":"skipped","reason":"invalid-id-format"}' >> "${RESULTS_FILE}"
    continue
  fi

  if [[ ! "${severity}" =~ ^(critical|high|medium|low)$ ]]; then
    echo "WARN: skipping ${id} due to invalid severity: ${severity}"
    skipped=$((skipped + 1))
    jq -n --arg id "${id}" '{"id":$id,"status":"skipped","reason":"invalid-severity"}' >> "${RESULTS_FILE}"
    continue
  fi

  existing="$(gh issue list \
    --repo "${REPO}" \
    --state open \
    --search "\"Finding-ID: ${id}\" in:body" \
    --limit 1 \
    --json number \
    --jq 'length')"

  if [[ "${existing}" != "0" ]]; then
    echo "SKIP duplicate finding id: ${id}"
    skipped=$((skipped + 1))
    jq -n --arg id "${id}" '{"id":$id,"status":"skipped","reason":"duplicate-open-issue"}' >> "${RESULTS_FILE}"
    continue
  fi

  issue_title="[Security][${severity^^}][${team}] ${title_raw}"

  evidence_block="$(jq -r '
    .evidence
    | map(
        "- [" + .type + "] "
        + (.value // "")
        + (if .file then " (`" + .file + (if .line then ":" + (.line|tostring) else "" end) + "`)" else "" end)
      )
    | join("\n")
  ' <<<"${row}")"

  verification_block="$(jq -r '
    .verification
    | map("- [ ] " + .)
    | join("\n")
  ' <<<"${row}")"

  references_block="$(jq -r '
    if (.references // [] | length) == 0 then "None"
    else (.references | map("- " + .) | join("\n"))
    end
  ' <<<"${row}")"

  issue_body=$(cat <<EOF
Finding-ID: ${id}

## Summary
${summary}

## Category
${category}

## Evidence
${evidence_block}

## Impact
${impact}

## Remediation
${remediation}

## Verification Checklist
${verification_block}

## References
${references_block}
EOF
)

  labels=("security-finding" "severity:${severity}" "team:${team}")
  ensure_label "team:${team}" "1D76DB" "Security finding ownership: ${team}"
  mapfile -t extra_labels < <(jq -r '.extra_labels[]? // empty' <<<"${row}")
  for l in "${extra_labels[@]}"; do
    labels+=("${l}")
    ensure_label "${l}" "5319E7" "Auto-created from findings metadata"
  done

  if [[ "${DRY_RUN}" == "true" ]]; then
    echo "DRY-RUN create: ${issue_title}"
    echo "  labels: ${labels[*]}"
    created=$((created + 1))
    jq -n --arg id "${id}" --arg title "${issue_title}" '{"id":$id,"status":"planned","title":$title}' >> "${RESULTS_FILE}"
    continue
  fi

  cmd=(gh issue create --repo "${REPO}" --title "${issue_title}" --body "${issue_body}")
  for lbl in "${labels[@]}"; do
    cmd+=(--label "${lbl}")
  done

  set +e
  issue_url="$("${cmd[@]}" 2>&1)"
  status=$?
  set -e

  if [[ "${status}" -ne 0 ]]; then
    echo "ERROR creating issue for ${id}: ${issue_url}" >&2
    errors=$((errors + 1))
    jq -n --arg id "${id}" --arg message "${issue_url}" '{"id":$id,"status":"error","message":$message}' >> "${RESULTS_FILE}"
    continue
  fi

  echo "CREATED ${issue_url}"
  created=$((created + 1))
  jq -n --arg id "${id}" --arg url "${issue_url}" '{"id":$id,"status":"created","url":$url}' >> "${RESULTS_FILE}"
done

echo
echo "Done. Created: ${created}, Skipped: ${skipped}, Errors: ${errors}, Repo: ${REPO}"

if [[ -n "${OUTPUT_FILE}" ]]; then
  mkdir -p "$(dirname "${OUTPUT_FILE}")"
  results_json="$(jq -s '.' "${RESULTS_FILE}")"
  jq -n \
    --arg repo "${REPO}" \
    --arg findings_file "${FINDINGS_FILE}" \
    --argjson created "${created}" \
    --argjson skipped "${skipped}" \
    --argjson errors "${errors}" \
    --argjson results "${results_json}" \
    '{
      repository: $repo,
      findings_file: $findings_file,
      created: $created,
      skipped: $skipped,
      errors: $errors,
      results: $results
    }' > "${OUTPUT_FILE}"
  echo "Report written: ${OUTPUT_FILE}"
fi
