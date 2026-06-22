#!/usr/bin/env bash
# do — search / edit tool availability check.
# Reports which CLI tools the do agents and skills lean on are installed, with
# version and an install hint for the ones that are missing. Read-only; never
# installs anything. Exits 0 regardless of what's present so it is safe to run
# as a preflight. Ported from the GEM search-orchestrator tool check; generalized.
set -uo pipefail

echo "do — tool availability"
echo "==============================="

check_tool() {
    local name="$1"
    local cmd="$2"
    local version_cmd="$3"
    local install_hint="$4"

    if command -v "$cmd" >/dev/null 2>&1; then
        local version
        version=$(eval "$version_cmd" 2>&1 | head -1)
        printf "  %-8s OK  %s\n" "$name" "$version"
    else
        printf "  %-8s --  NOT INSTALLED (%s)\n" "$name" "$install_hint"
    fi
}

# Tools the do hooks and tools themselves require:
check_tool "node" "node" "node --version" "https://nodejs.org"
check_tool "jq"   "jq"   "jq --version"   "https://jqlang.github.io/jq/"
check_tool "git"  "git"  "git --version"  "https://git-scm.com"

# Search / structural-edit tools the agents and skills use when present:
check_tool "rg"    "rg"    "rg --version"     "cargo install ripgrep"
check_tool "sed"   "sed"   "sed --version"    "included with Git Bash / coreutils"
check_tool "sd"    "sd"    "sd --version"     "cargo install sd"
check_tool "fzf"   "fzf"   "fzf --version"    "https://github.com/junegunn/fzf"
check_tool "sg"    "sg"    "sg --version"     "npm install -g @ast-grep/cli"
check_tool "comby" "comby" "comby -version"   "https://comby.dev"
check_tool "python" "python" "python --version" "https://python.org"

exit 0
