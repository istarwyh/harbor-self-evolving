import json
from pathlib import Path

from harbor_dsh_evolution.artifacts import write_job_artifacts
from harbor_dsh_evolution.summary import summarize_job


CONTRACT = {
    "contract_id": "demo",
    "version": "1",
    "primary_metric": "reward",
    "metrics": [{"id": "reward", "direction": "maximize"}],
    "hard_requirements": [
        {"id": "input_integrity"},
        {"id": "agent_completed"},
        {"id": "integration_valid"},
        {"id": "renderer_valid"},
        {"id": "judge_completed"},
        {"id": "artifact_schema_valid"},
    ],
}


def test_summarize_job_aggregates_only_valid_quality_scores(tmp_path: Path):
    context = {
        "schema_version": 2,
        "digest": "sha256:" + "c" * 64,
        "mode": "diagnostic",
        "dataset": {"task_count": 2},
    }
    (tmp_path / "candidate-manifest.json").write_text(
        json.dumps({"candidate_id": "demo", "digest": "sha256:" + "0" * 64})
    )
    (tmp_path / "evaluation-context.json").write_text(json.dumps(context))
    payloads = []
    for name in ("a", "b"):
        payload = {
            "id": name,
            "task_name": name,
            "trial_name": name,
            "agent_info": {"name": "demo"},
            "agent_result": {"metadata": {}},
            "verifier_result": {"rewards": {"reward": 0.4 if name == "a" else 1.0}},
            "exception_info": None if name == "a" else {"exception_type": "RuntimeError"},
        }
        payloads.append(payload)
        trial = tmp_path / f"trial-{name}"
        trial.mkdir()
        (trial / "result.json").write_text(json.dumps(payload))
    write_job_artifacts(tmp_path, payloads, evaluation_contract=CONTRACT)
    summary = summarize_job(tmp_path)
    assert summary["schema_version"] == 3
    assert summary["n_trials"] == 2
    assert summary["n_valid_scores"] == 1
    assert summary["n_invalid_scores"] == 1
    assert summary["n_infrastructure_exceptions"] == 1
    assert summary["metrics"] == {"reward": 0.4}
    assert summary["artifact_validation"]["valid"] is True


def test_summary_reuses_trial_validity_when_evaluator_result_is_missing(tmp_path: Path):
    payload = {
        "id": "missing-result",
        "task_name": "missing-result",
        "trial_name": "missing-result",
        "agent_info": {"name": "demo"},
        "agent_result": {"metadata": {}},
        "verifier_result": {"rewards": {"reward": 1.0}},
        "exception_info": None,
    }
    trial = tmp_path / "trial-missing"
    trial.mkdir()
    (trial / "result.json").write_text(json.dumps(payload))
    stack_manifest = {
        "components": {
            "evaluator": {
                "interface": {
                    "criteria": [
                        {"id": "quality", "label": "Quality", "values": [0, 0.5, 1]}
                    ]
                }
            }
        }
    }
    write_job_artifacts(
        tmp_path,
        [payload],
        evaluation_contract=CONTRACT,
        stack_manifest=stack_manifest,
    )

    summary = summarize_job(tmp_path)

    assert summary["n_valid_scores"] == 0
    assert summary["metrics"] == {}
    assert "evaluator-result-invalid:evaluation-result.json is missing" in summary["trials"][0]["score"]["invalid_reasons"]
