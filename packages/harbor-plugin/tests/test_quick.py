from pathlib import Path

import pytest

from harbor_dsh_evolution.dataset import validate_dataset
from harbor_dsh_evolution.doctor import architecture_doctor
from harbor_dsh_evolution.quick import initialize_quick_diagnostic
from harbor_dsh_evolution.runtime_binding import render_runtime_config
from harbor_dsh_evolution.stack import validate_stack


def test_quick_diagnostic_generates_runnable_harbor_14_boundaries(tmp_path: Path):
    result = initialize_quick_diagnostic(
        project_root=tmp_path,
        query="什么是重力？",
        rubric="回应问题；有趣性；引用规范性。",
    )

    assert result["promotion_eligible"] is False
    assert "does not apply" in result["warning"]
    candidate = tmp_path / result["candidate_path"]
    dataset = tmp_path / result["dataset_path"]
    task_toml = (dataset / "wiring-check" / "task.toml").read_text()
    assert 'schema_version = "1.4"' in task_toml
    assert 'name = "diagnostic/harbor-diagnostic"' in task_toml
    assert validate_dataset(dataset, project_root=tmp_path).valid is True
    assert validate_stack(tmp_path / result["stack_path"], project_root=tmp_path)["valid"] is True
    doctor = architecture_doctor(
        project_root=tmp_path,
        stack_path=tmp_path / result["stack_path"],
        dataset_path=dataset,
        candidate_path=candidate,
        policy_path=tmp_path / result["policy_path"],
    )
    assert doctor["promotion_ready"] is False
    assert "DIAGNOSTIC_ONLY_STACK" in {item["code"] for item in doctor["findings"]}
    assert (candidate / "candidate-manifest.json").is_file()
    overlay = render_runtime_config(candidate, gateway_provider="dsh-host", model="host-model")
    assert "dsh-host" in overlay
    assert "host-model" in overlay
    rubric = (tmp_path / "harbor-diagnostic/evaluators/default/rubric.md").read_text()
    assert "not executed" in rubric


def test_quick_diagnostic_never_overwrites_existing_workspace(tmp_path: Path):
    args = dict(project_root=tmp_path, query="What is color?", rubric="Answer clearly.")
    initialize_quick_diagnostic(**args)
    with pytest.raises(ValueError, match="QUICK_DIAGNOSTIC_ALREADY_EXISTS"):
        initialize_quick_diagnostic(**args)
