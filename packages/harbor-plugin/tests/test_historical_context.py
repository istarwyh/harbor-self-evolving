from __future__ import annotations

import json
import sys
from pathlib import Path

from harbor_dsh_evolution.cli import main
from harbor_dsh_evolution.historical_context import build_historical_context
from harbor_dsh_evolution.session_batch import materialize_historical_dataset

from helpers import HISTORICAL_JUDGE_BINDING, make_historical_batch


def test_historical_context_describes_existing_records_without_candidate(tmp_path: Path):
    batch_path, batch, _ = make_historical_batch(tmp_path, count=2)
    materialized = materialize_historical_dataset(
        project_root=tmp_path,
        batch_path=batch_path,
        output_path=tmp_path / "historical-dataset",
        **HISTORICAL_JUDGE_BINDING,
    )
    context = build_historical_context(
        project_root=tmp_path,
        batch_path=batch_path,
        dataset_path=Path(materialized["dataset_path"]),
        stack_path=Path(materialized["stack_path"]),
    )
    assert context["protocol"] == "historical-generation-evaluation-context/v1"
    assert context["job_kind"] == "historical-generation-evaluation"
    assert context["execution_mode"] == "observe-existing"
    assert context["promotion_eligible"] is False
    assert context["evaluation_level"] == "trial"
    assert context["evaluation_target"] == {
        "kind": "generation-record-batch",
        "source_kind": "dsh-session",
        "batch_id": batch["batch_id"],
        "digest": batch["digest"],
        "record_count": 2,
        "generator_population": batch["generator_population"],
    }
    assert context["generation_source"]["mode"] == "existing-records"
    assert context["generation_source"]["adapter_id"] == "dsh-session-query"
    assert context["downstream_analysis"]["population_analysis"] is True
    assert context["downstream_analysis"]["evaluator_meta_evaluation"] == {
        "status": "not-run",
        "validation_report_ref": None,
    }
    assert context["evaluation_stack"]["judge"]["provider"] == "judge-provider"
    assert context["evaluation_stack"]["judge"]["model"] == "judge-model"
    assert context["evaluation_stack"]["judge"]["reasoning_effort"] == "high"
    assert (
        context["evaluation_stack"]["judge"]["coupling"]
        == "independent-historical-judge"
    )
    assert "candidate" not in context


def test_historical_cli_materialize_validate_and_context(
    tmp_path: Path, monkeypatch, capsys
):
    batch_path, batch, _ = make_historical_batch(tmp_path)
    output = tmp_path / "cli-dataset"
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "harbor-dsh",
            "historical",
            "materialize",
            "--project-root",
            str(tmp_path),
            "--batch",
            str(batch_path),
            "--output",
            str(output),
            "--judge-provider",
            HISTORICAL_JUDGE_BINDING["judge_provider"],
            "--judge-model",
            HISTORICAL_JUDGE_BINDING["judge_model"],
            "--judge-reasoning-effort",
            HISTORICAL_JUDGE_BINDING["judge_reasoning_effort"],
        ],
    )
    assert main() == 0
    materialized = json.loads(capsys.readouterr().out)
    assert {"dataset_path", "stack_path", "batch_path"} <= set(materialized)

    monkeypatch.setattr(
        sys,
        "argv",
        [
            "harbor-dsh",
            "historical",
            "validate",
            "--project-root",
            str(tmp_path),
            "--batch",
            str(batch_path),
        ],
    )
    assert main() == 0
    validated = json.loads(capsys.readouterr().out)
    assert validated["valid"] is True
    assert validated["batch_digest"] == batch["digest"]

    monkeypatch.setattr(
        sys,
        "argv",
        [
            "harbor-dsh",
            "historical",
            "context",
            "--project-root",
            str(tmp_path),
            "--batch",
            str(batch_path),
            "--dataset",
            materialized["dataset_path"],
            "--stack",
            materialized["stack_path"],
        ],
    )
    assert main() == 0
    context = json.loads(capsys.readouterr().out)
    assert context["protocol"] == "historical-generation-evaluation-context/v1"


def test_historical_context_rejects_dataset_record_reordering(tmp_path: Path):
    batch_path, _, _ = make_historical_batch(tmp_path, count=2)
    materialized = materialize_historical_dataset(
        project_root=tmp_path,
        batch_path=batch_path,
        output_path=tmp_path / "dataset",
        **HISTORICAL_JUDGE_BINDING,
    )
    manifest_path = Path(materialized["dataset_path"]) / "dataset-manifest.json"
    manifest = json.loads(manifest_path.read_text())
    manifest["tasks"] = list(reversed(manifest["tasks"]))
    manifest_path.write_text(json.dumps(manifest))
    try:
        build_historical_context(
            project_root=tmp_path,
            batch_path=batch_path,
            dataset_path=Path(materialized["dataset_path"]),
            stack_path=Path(materialized["stack_path"]),
        )
    except ValueError as error:
        assert "record order" in str(error)
    else:
        raise AssertionError("Reordered Historical Dataset was accepted")
