import json
from pathlib import Path

from harbor_dsh_evolution.context import build_evaluation_context


def make_dataset(tmp_path: Path) -> Path:
    dataset = tmp_path / "dataset"
    (dataset / "environment").mkdir(parents=True)
    (dataset / "tests").mkdir()
    (dataset / "task.toml").write_text(
        '[task]\nname = "business/research"\nversion = "1.2.0"\n'
    )
    (dataset / "environment" / "Dockerfile").write_text("FROM alpine:3.22\n")
    (dataset / "tests" / "verify.py").write_text("print('ok')\n")
    return dataset


def test_context_is_stable_and_portable(tmp_path: Path):
    dataset = make_dataset(tmp_path)
    first = build_evaluation_context(dataset)
    second = build_evaluation_context(dataset)
    assert first.digest == second.digest
    assert first.file_count == 3
    assert first.tasks[0].name == "business/research"
    assert first.tasks[0].version == "1.2.0"
    assert str(dataset) not in json.dumps(first.to_dict())


def test_context_changes_when_verifier_changes(tmp_path: Path):
    dataset = make_dataset(tmp_path)
    first = build_evaluation_context(dataset)
    (dataset / "tests" / "verify.py").write_text("print('changed')\n")
    second = build_evaluation_context(dataset)
    assert second.dataset_digest != first.dataset_digest
    assert second.digest != first.digest
