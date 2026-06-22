#!/usr/bin/env python3
"""
map_codebase_structure.py — Produce a weighted directory tree with file counts,
line counts, language stats, and framework markers.

Usage:
    python map_codebase_structure.py <root_path> [--depth N] [--exclude dir1,dir2,...]

Output: JSON to stdout.
"""

import argparse
import json
import os
import sys
from collections import Counter
from pathlib import Path

LANGUAGE_EXTENSIONS = {
    ".java": "Java",
    ".kt": "Kotlin",
    ".kts": "Kotlin Script",
    ".scala": "Scala",
    ".ts": "TypeScript",
    ".tsx": "TypeScript (JSX)",
    ".js": "JavaScript",
    ".jsx": "JavaScript (JSX)",
    ".py": "Python",
    ".go": "Go",
    ".rs": "Rust",
    ".rb": "Ruby",
    ".php": "PHP",
    ".cs": "C#",
    ".cpp": "C++",
    ".c": "C",
    ".h": "C/C++ Header",
    ".swift": "Swift",
    ".dart": "Dart",
    ".ex": "Elixir",
    ".exs": "Elixir Script",
    ".clj": "Clojure",
    ".sql": "SQL",
    ".graphql": "GraphQL",
    ".proto": "Protocol Buffers",
    ".yaml": "YAML",
    ".yml": "YAML",
    ".json": "JSON",
    ".toml": "TOML",
    ".xml": "XML",
    ".md": "Markdown",
    ".css": "CSS",
    ".scss": "SCSS",
    ".less": "LESS",
    ".html": "HTML",
    ".vue": "Vue",
    ".svelte": "Svelte",
}

FRAMEWORK_MARKERS = {
    "build.gradle.kts": "Gradle (Kotlin DSL)",
    "build.gradle": "Gradle (Groovy DSL)",
    "pom.xml": "Maven",
    "package.json": "npm/Node.js",
    "Cargo.toml": "Cargo (Rust)",
    "go.mod": "Go Modules",
    "pyproject.toml": "Python (modern)",
    "requirements.txt": "Python (pip)",
    "Gemfile": "Ruby (Bundler)",
    "mix.exs": "Elixir (Mix)",
    "composer.json": "PHP (Composer)",
    "Dockerfile": "Docker",
    "docker-compose.yml": "Docker Compose",
    "docker-compose.yaml": "Docker Compose",
    "Chart.yaml": "Helm",
    "values.yaml": "Helm Values",
    "Jenkinsfile": "Jenkins CI",
    ".gitlab-ci.yml": "GitLab CI",
    "vercel.json": "Vercel",
    "netlify.toml": "Netlify",
    "fly.toml": "Fly.io",
    "tsconfig.json": "TypeScript",
    "vite.config.ts": "Vite",
    "vite.config.js": "Vite",
    "next.config.js": "Next.js",
    "next.config.mjs": "Next.js",
    "next.config.ts": "Next.js",
    "angular.json": "Angular",
    "svelte.config.js": "SvelteKit",
    "nuxt.config.ts": "Nuxt",
    "tailwind.config.js": "Tailwind CSS",
    "tailwind.config.ts": "Tailwind CSS",
    "application.yml": "Spring Boot",
    "application.properties": "Spring Boot",
    "settings.gradle.kts": "Gradle Multi-Project",
    "settings.gradle": "Gradle Multi-Project",
    "nx.json": "Nx Monorepo",
    "lerna.json": "Lerna Monorepo",
    "pnpm-workspace.yaml": "pnpm Workspace",
    "turbo.json": "Turborepo",
}

DEFAULT_EXCLUDES = {
    "node_modules", ".git", "build", "dist", "target", ".next",
    "__pycache__", ".gradle", ".idea", ".vscode", ".cache",
    "vendor", "venv", ".venv", "env", ".env", "coverage",
    ".turbo", ".nx", "out",
}


def count_lines(filepath):
    """Count lines in a file, returning 0 on read errors."""
    try:
        with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
            return sum(1 for _ in f)
    except (OSError, PermissionError):
        return 0


def scan_directory(root, exclude_set, max_depth, current_depth=0):
    """Recursively scan a directory and produce a tree structure."""
    root_path = Path(root)
    if not root_path.is_dir():
        return None

    node = {
        "name": root_path.name,
        "path": str(root_path),
        "file_count": 0,
        "line_count": 0,
        "languages": Counter(),
        "framework_markers": [],
        "children": [],
    }

    try:
        entries = sorted(root_path.iterdir(), key=lambda e: (not e.is_dir(), e.name.lower()))
    except PermissionError:
        return node

    for entry in entries:
        if entry.name in exclude_set:
            continue
        if entry.name.startswith(".") and entry.is_dir() and entry.name not in (".github",):
            continue

        if entry.is_file():
            node["file_count"] += 1
            ext = entry.suffix.lower()
            lang = LANGUAGE_EXTENSIONS.get(ext)
            if lang:
                lines = count_lines(entry)
                node["line_count"] += lines
                node["languages"][lang] += lines

            marker = FRAMEWORK_MARKERS.get(entry.name)
            if marker:
                node["framework_markers"].append(marker)

        elif entry.is_dir() and current_depth < max_depth:
            child = scan_directory(entry, exclude_set, max_depth, current_depth + 1)
            if child:
                node["children"].append(child)
                node["file_count"] += child["file_count"]
                node["line_count"] += child["line_count"]
                node["languages"] += child["languages"]

    return node


def flatten_languages(node):
    """Convert Counter to sorted list of [language, line_count] pairs."""
    if node is None:
        return None
    node["languages"] = sorted(
        node["languages"].items(), key=lambda x: -x[1]
    )
    for child in node.get("children", []):
        flatten_languages(child)
    return node


def compute_summary(tree):
    """Produce a top-level summary from the tree."""
    if tree is None:
        return {}
    all_langs = Counter()
    all_markers = []

    def walk(node):
        for lang, count in node.get("languages", []):
            all_langs[lang] += count
        all_markers.extend(node.get("framework_markers", []))
        for child in node.get("children", []):
            walk(child)

    walk(tree)

    return {
        "total_files": tree["file_count"],
        "total_lines": tree["line_count"],
        "languages": sorted(all_langs.items(), key=lambda x: -x[1]),
        "dominant_language": all_langs.most_common(1)[0][0] if all_langs else "unknown",
        "framework_markers": sorted(set(all_markers)),
    }


def main():
    parser = argparse.ArgumentParser(
        description="Map codebase structure into a weighted directory tree."
    )
    parser.add_argument("root", help="Root path of the codebase to analyze")
    parser.add_argument(
        "--depth", type=int, default=4,
        help="Maximum directory depth to scan (default: 4)"
    )
    parser.add_argument(
        "--exclude", type=str, default="",
        help="Comma-separated list of directory names to exclude"
    )

    args = parser.parse_args()
    root = os.path.abspath(args.root)

    if not os.path.isdir(root):
        print(json.dumps({"error": f"Path '{root}' is not a directory"}))
        sys.exit(1)

    exclude_set = set(DEFAULT_EXCLUDES)
    if args.exclude:
        exclude_set.update(name.strip() for name in args.exclude.split(","))

    tree = scan_directory(root, exclude_set, args.depth)
    tree = flatten_languages(tree)
    summary = compute_summary(tree)

    output = {
        "root": root,
        "depth": args.depth,
        "excluded": sorted(exclude_set),
        "summary": summary,
        "tree": tree,
    }

    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
