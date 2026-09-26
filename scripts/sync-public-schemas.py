#!/usr/bin/env python3
"""Synchronize the root public protocol schemas into distributable packages."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "schemas"
DESTINATIONS = (
    ROOT / "packages" / "dsh-plugin" / "schemas",
    ROOT / "packages" / "harbor-plugin" / "src" / "harbor_dsh_evolution" / "schemas",
)


def main() -> None:
    sources = sorted(SOURCE.glob("*.json"))
    if not sources:
        raise SystemExit("No public schemas found")
    for source in sources:
        json.loads(source.read_text())
    for destination in DESTINATIONS:
        destination.mkdir(parents=True, exist_ok=True)
        for source in sources:
            (destination / source.name).write_bytes(source.read_bytes())
        stale = {path.name for path in destination.glob("*.json")} - {path.name for path in sources}
        if stale:
            raise SystemExit(f"Refusing to delete stale schema copies in {destination}: {sorted(stale)}")
    print(f"synchronized {len(sources)} schemas into {len(DESTINATIONS)} packages")


if __name__ == "__main__":
    main()
