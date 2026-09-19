#!/usr/bin/env python3
"""Fail publication when the Hugo artifact leaks secrets, paths, or broken project-subpath links."""
from __future__ import annotations

import argparse
import os
import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

TEXT_SUFFIXES = {".html", ".css", ".js", ".json", ".xml", ".txt", ".md", ".svg"}
SECRET_PATTERNS = {
    "private key": re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    "GitHub token": re.compile(r"\bgh[pousr]_[A-Za-z0-9_]{20,}\b"),
    "Harbor context token": re.compile(r"\bhctx_[A-Za-z0-9_-]{8,}\b"),
    "macOS home path": re.compile(r"/Users/[^/\s<]+/"),
    "macOS temp path": re.compile(r"/var/folders/[A-Za-z0-9_/.-]+"),
}
ATTR_RE = re.compile(r'''\b(?:href|src)=(?:"([^"]+)"|'([^']+)')''', re.IGNORECASE)


def target_exists(public: Path, current: Path, raw: str, base_path: str) -> bool:
    parsed = urlsplit(raw)
    if parsed.scheme or parsed.netloc or raw.startswith(("mailto:", "tel:", "data:", "javascript:", "#")):
        return True
    path = unquote(parsed.path)
    if not path:
        return True
    if path.startswith("/"):
        if not path.startswith(base_path):
            return False
        path = path[len(base_path):]
        target = public / path
    else:
        target = current.parent / path
    candidates = [target]
    if path.endswith("/") or target.is_dir():
        candidates.append(target / "index.html")
    elif not target.suffix:
        candidates.extend([target / "index.html", target.with_suffix(".html")])
    return any(p.exists() for p in candidates)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("public", type=Path)
    parser.add_argument("--base-path", default="/harbor-self-evolving/")
    parser.add_argument("--max-bytes", type=int, default=1_000_000_000)
    args = parser.parse_args()
    public = args.public.resolve()
    base_path = "/" + args.base_path.strip("/") + "/"
    errors: list[str] = []
    total = 0

    if not (public / "index.html").is_file():
        errors.append("missing public/index.html")

    for path in public.rglob("*"):
        if path.is_symlink():
            errors.append(f"symlink is not allowed: {path.relative_to(public)}")
            continue
        if not path.is_file():
            continue
        total += path.stat().st_size
        if path.stat().st_nlink > 1:
            errors.append(f"hard-linked file is not allowed: {path.relative_to(public)}")
        if path.suffix.lower() not in TEXT_SUFFIXES:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        for label, pattern in SECRET_PATTERNS.items():
            if pattern.search(text):
                errors.append(f"{label} found in {path.relative_to(public)}")
        if path.suffix.lower() == ".html":
            for match in ATTR_RE.finditer(text):
                raw = match.group(1) or match.group(2)
                if not target_exists(public, path, raw, base_path):
                    errors.append(f"broken or root-leaking link in {path.relative_to(public)}: {raw}")

    if total > args.max_bytes:
        errors.append(f"artifact is {total} bytes; budget is {args.max_bytes}")
    if errors:
        for error in sorted(set(errors)):
            print(f"ERROR: {error}")
        return 1
    print(f"OK: {len(list(public.rglob('*')))} entries, {total} bytes, base path {base_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
