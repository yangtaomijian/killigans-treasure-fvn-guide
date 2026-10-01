#!/usr/bin/env python3
"""Validate the local Pages artifact without contacting production services."""

from pathlib import Path
import sys


SITE = Path(__file__).resolve().parents[1]
OUTPUT = SITE / "_site"
HOSTNAME = "killigans-treasure.carambi.com"
REQUIRED = ("index.html", "en/index.html", "404.html", "CNAME", "robots.txt", "sitemap.xml")
PRIVATE_DIRS = {"research", "archive", "runtime-evidence", "private-inputs", "source", ".git", ".github", ".wrangler"}
PRIVATE_SUFFIXES = {".rpy", ".rpyc", ".rpa", ".save", ".persistent", ".zip", ".tar", ".gz", ".md", ".csv", ".py", ".sh", ".sqlite", ".db", ".pem", ".key"}


def main():
    errors = []
    if not OUTPUT.is_dir() or OUTPUT.is_symlink():
        print("Pages artifact verification FAIL: output must be a real directory", file=sys.stderr)
        return 1
    for name in REQUIRED:
        if not (OUTPUT / name).is_file():
            errors.append(f"missing required Pages output: {name}")
    cname = OUTPUT / "CNAME"
    if cname.is_file() and cname.read_text(encoding="utf-8").strip() != HOSTNAME:
        errors.append("Pages hostname declaration does not match production")
    total_bytes = 0
    files = 0
    for path in OUTPUT.rglob("*") if OUTPUT.is_dir() else ():
        rel = path.relative_to(OUTPUT)
        if path.is_symlink():
            errors.append(f"symbolic link in artifact: {rel}")
            continue
        if PRIVATE_DIRS.intersection(rel.parts) or (rel.as_posix() != ".nojekyll" and any(part.startswith(".") for part in rel.parts)):
            errors.append(f"private/hidden path in artifact: {rel}")
        if not path.is_file():
            if not path.is_dir():
                errors.append(f"special file in artifact: {rel}")
            continue
        if path.suffix.lower() in PRIVATE_SUFFIXES or path.name == "persistent":
            errors.append(f"private/source file in artifact: {rel}")
        stat = path.stat()
        if stat.st_nlink > 1:
            errors.append(f"hard link in artifact: {rel}")
        total_bytes += stat.st_size
        files += 1
    if total_bytes > 1_000_000_000:
        errors.append("Pages artifact exceeds the supported 1 GB site limit")
    if errors:
        print("Pages artifact verification FAIL", file=sys.stderr)
        for error in errors:
            print(error, file=sys.stderr)
        return 1
    print(f"Pages artifact verification PASS: {files} files, {total_bytes} bytes; public output only")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
