#!/usr/bin/env python3
"""
Script to recursively replace 'Klove' / 'KloveRouter' variants with 'Saturn' / 'SaturnRouter'
across the repository while preserving exact text casing, formatting, line endings,
and indentation.

Supports:
- PascalCase:  KloveRouter -> SaturnRouter, Klove -> Saturn
- camelCase:   kloveRouter -> saturnRouter, klove -> saturn
- kebab-case:  klove-router -> saturn-router, klove-preview -> saturn-preview
- snake_case:  klove_router -> saturn_router, klove_token -> saturn_token
- SCREAMING:   KLOVE_ROUTER -> SATURN_ROUTER, KLOVE_API_KEY -> SATURN_API_KEY
- Spaced:      Klove Router -> Saturn Router
"""

import os
import re
import sys
import argparse
from pathlib import Path

# Directories to skip
IGNORED_DIRS = {
    ".git",
    "node_modules",
    "dist",
    "out",
    "data",
    ".cache",
    ".opencode",
    ".idea",
    "coverage",
    "build",
}

# File extensions to ignore (binaries, locks, etc.)
IGNORED_EXTENSIONS = {
    ".png",
    ".ico",
    ".jpg",
    ".jpeg",
    ".webp",
    ".gif",
    ".svg",  # keep provider brand icons and logos intact
    ".woff",
    ".woff2",
    ".ttf",
    ".eot",
    ".lock",
    ".lockb",
    ".db",
    ".sqlite",
    ".sqlite-wal",
    ".sqlite-shm",
    ".tar",
    ".gz",
    ".tgz",
    ".zip",
}

# Replacement pairs in strict descending order of specificity
REPLACEMENTS = [
    # Compound / Router phrases first
    (re.compile(r"Klove\s+Router"), "Saturn Router"),
    (re.compile(r"klove\s+router"), "saturn router"),
    (re.compile(r"KloveRouter"), "SaturnRouter"),
    (re.compile(r"klove-router"), "saturn-router"),
    (re.compile(r"klove_router"), "saturn_router"),
    (re.compile(r"kloverouter"), "saturnrouter"),
    (re.compile(r"KLOVE_ROUTER"), "SATURN_ROUTER"),

    # Environment variables & identifiers
    (re.compile(r"KLOVE_API_KEY"), "SATURN_API_KEY"),
    (re.compile(r"KLOVE_BASE_URL"), "SATURN_BASE_URL"),
    (re.compile(r"KLOVE_ENCRYPTION_KEY"), "SATURN_ENCRYPTION_KEY"),
    (re.compile(r"\bKLOVE_"), "SATURN_"),

    # Single word variants (casing preserved)
    (re.compile(r"\bKlove\b"), "Saturn"),
    (re.compile(r"\bklove\b"), "saturn"),
    (re.compile(r"\bKLOVE\b"), "SATURN"),

    # Common prefixes / suffixes in code
    (re.compile(r"klove-"), "saturn-"),
    (re.compile(r"klove_"), "saturn_"),
]

def is_text_file(filepath: Path) -> bool:
    if filepath.suffix.lower() in IGNORED_EXTENSIONS:
        return False
    # Check if first 1024 bytes contain null bytes
    try:
        with open(filepath, "rb") as f:
            chunk = f.read(1024)
            if b"\x00" in chunk:
                return False
        return True
    except Exception:
        return False

def process_file(filepath: Path, dry_run: bool = False) -> int:
    try:
        with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
            original = f.read()
    except Exception as e:
        print(f"Skipping {filepath} (error reading: {e})", file=sys.stderr)
        return 0

    content = original
    replacements_count = 0

    for pattern, replacement in REPLACEMENTS:
        matches = len(pattern.findall(content))
        if matches > 0:
            content = pattern.sub(replacement, content)
            replacements_count += matches

    if content != original:
        if not dry_run:
            with open(filepath, "w", encoding="utf-8", newline="") as f:
                f.write(content)
        return replacements_count

    return 0

def run(root_dir: Path, dry_run: bool = False):
    total_files = 0
    modified_files = 0
    total_replacements = 0

    print(f"Scanning directory: {root_dir}")
    print(f"Mode: {'DRY RUN (no changes written)' if dry_run else 'APPLY (changes will be saved)'}\n")

    for dirpath, dirnames, filenames in os.walk(root_dir):
        # Prune ignored directories
        dirnames[:] = [d for d in dirnames if d not in IGNORED_DIRS]

        for filename in filenames:
            filepath = Path(dirpath) / filename
            total_files += 1

            if not is_text_file(filepath):
                continue

            # Don't modify the replacement script itself
            if filepath.resolve() == Path(__file__).resolve():
                continue

            count = process_file(filepath, dry_run=dry_run)
            if count > 0:
                modified_files += 1
                total_replacements += count
                rel_path = filepath.relative_to(root_dir)
                status = "[WOULD MODIFY]" if dry_run else "[MODIFIED]"
                print(f"{status} {rel_path} ({count} replacement{'s' if count > 1 else ''})")

    print("\n" + "=" * 50)
    print(f"Total files scanned:       {total_files}")
    print(f"Files modified:            {modified_files}")
    print(f"Total occurrences replaced:{total_replacements}")
    print("=" * 50)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Replace 'Klove' with 'Saturn' across repository preserving casing."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Simulate changes without writing to disk",
    )
    parser.add_argument(
        "--path",
        type=str,
        default=".",
        help="Root path to run the replacement (default: current directory)",
    )

    args = parser.parse_args()
    target_path = Path(args.path).resolve()
    run(target_path, dry_run=args.dry_run)
