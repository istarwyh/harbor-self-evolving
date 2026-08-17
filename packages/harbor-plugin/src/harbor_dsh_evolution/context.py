from __future__ import annotations

import hashlib
import json
import tomllib
from dataclasses import asdict, dataclass
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path
from typing import Any

CONTEXT_NAME = "evaluation-context.json"
_TREE_PREFIX = b"harbor-dsh-evaluation-tree-v1\0"
_CONTEXT_PREFIX = b"harbor-dsh-evaluation-context-v1\0"
_EXCLUDED_DIRS = {".git", "node_modules", "__pycache__"}
_EXCLUDED_FILES = {".DS_Store"}


@dataclass(frozen=True)
class TaskIdentity:
    path: str
    name: str
    version: str


@dataclass(frozen=True)
class EvaluationContext:
    schema_version: int
    digest: str
    dataset_digest: str
    file_count: int
    tasks: list[TaskIdentity]
    harbor_version: str
    integration_version: str
    integration_digest: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _package_version(package: str) -> str:
    try:
        return version(package)
    except PackageNotFoundError:
        return "unknown"


def _dataset_files(dataset_dir: Path) -> list[Path]:
    paths: list[Path] = []
    for path in dataset_dir.rglob("*"):
        relative = path.relative_to(dataset_dir)
        if any(part in _EXCLUDED_DIRS for part in relative.parts):
            continue
        if path.name in _EXCLUDED_FILES:
            continue
        if path.is_symlink():
            raise ValueError(f"Evaluation dataset must not contain symlinks: {relative}")
        if path.is_file():
            paths.append(path)
    return sorted(paths, key=lambda item: item.relative_to(dataset_dir).as_posix())


def _compute_tree(dataset_dir: Path) -> tuple[str, list[Path]]:
    files = _dataset_files(dataset_dir)
    digest = hashlib.sha256()
    digest.update(_TREE_PREFIX)
    for path in files:
        relative = path.relative_to(dataset_dir).as_posix()
        content = path.read_bytes()
        digest.update(relative.encode("utf-8"))
        digest.update(b"\0")
        digest.update(str(len(content)).encode("ascii"))
        digest.update(b"\0")
        digest.update(content)
        digest.update(b"\0")
    return f"sha256:{digest.hexdigest()}", files


def _task_identities(dataset_dir: Path, files: list[Path]) -> list[TaskIdentity]:
    tasks: list[TaskIdentity] = []
    for path in files:
        if path.name != "task.toml":
            continue
        payload = tomllib.loads(path.read_text())
        task = payload.get("task") or {}
        tasks.append(
            TaskIdentity(
                path=path.parent.relative_to(dataset_dir).as_posix() or ".",
                name=str(task.get("name") or path.parent.name),
                version=str(task.get("version") or "unknown"),
            )
        )
    return tasks


def build_evaluation_context(dataset_dir: Path) -> EvaluationContext:
    dataset_dir = dataset_dir.expanduser().resolve(strict=True)
    if not dataset_dir.is_dir():
        raise ValueError(f"Evaluation dataset is not a directory: {dataset_dir}")

    dataset_digest, files = _compute_tree(dataset_dir)
    tasks = _task_identities(dataset_dir, files)
    harbor_version = _package_version("harbor")
    integration_version = _package_version("harbor-dsh-evolution")
    integration_digest, _ = _compute_tree(Path(__file__).parent)
    identity = {
        "schema_version": 1,
        "dataset_digest": dataset_digest,
        "tasks": [asdict(task) for task in tasks],
        "harbor_version": harbor_version,
        "integration_version": integration_version,
        "integration_digest": integration_digest,
    }
    digest = hashlib.sha256()
    digest.update(_CONTEXT_PREFIX)
    canonical_identity = json.dumps(
        identity, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    )
    digest.update(canonical_identity.encode("utf-8"))
    return EvaluationContext(
        schema_version=1,
        digest=f"sha256:{digest.hexdigest()}",
        dataset_digest=dataset_digest,
        file_count=len(files),
        tasks=tasks,
        harbor_version=harbor_version,
        integration_version=integration_version,
        integration_digest=integration_digest,
    )
