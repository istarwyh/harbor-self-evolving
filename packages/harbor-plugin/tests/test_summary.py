import json
from pathlib import Path

from jsonschema import Draft202012Validator

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
        {"id": "evaluator_identity_match"},
        {"id": "artifact_schema_valid"},
    ],
}


IDENTITY = {"id": "strict", "version": "1", "portable_digest": "sha256:" + "a" * 64}
INTERFACE = {
    "evaluator_id": "strict",
    "version": "1",
    "portable_digest": IDENTITY["portable_digest"],
    "bundle_complete": True,
    "interface": "harbor-dsh-evaluator/v2",
    "protocol": {"input": "evaluation-input/v2", "output": "evaluation-result/v2"},
    "criteria": [{"id": "quality", "label": "Quality", "values": [0, 0.5, 1]}],
    "aggregate": {"metric_id": "reward", "method": "mean"},
}
STACK_MANIFEST = {"components": {"evaluator": {"interface": INTERFACE}}}


def strict_result(score):
    runtime_identity = {**IDENTITY, "bundle_complete": True}
    return {
        "schema_version": 2,
        "protocol": "evaluation-result/v2",
        "criteria": [{"id": "quality", "status": "scored", "score": score, "reason": "Measured.", "recommendation": "Preserve.", "evidence_refs": ["captured-output"]}],
        "aggregate": {"metric_id": "reward", "value": float(score), "scored_criteria": 1, "total_criteria": 1, "coverage": 1.0},
        "effective_evaluator": {
            "schema_version": 1,
            "protocol": "effective-evaluator/v1",
            "configured": IDENTITY,
            "materialized": runtime_identity,
            "executed": runtime_identity,
            "identity_match": True,
            "execution": {"status": "succeeded", "error_type": None},
        },
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
        payload["trial_uri"] = trial.as_uri()
        verifier = trial / "verifier"
        verifier.mkdir()
        (verifier / "evaluation-result.json").write_text(json.dumps(strict_result(0.5 if name == "a" else 1)))
        (trial / "result.json").write_text(json.dumps(payload))
    write_job_artifacts(tmp_path, payloads, evaluation_contract=CONTRACT, stack_manifest=STACK_MANIFEST)
    summary = summarize_job(tmp_path)
    assert summary["schema_version"] == 3
    schema = json.loads((Path(__file__).parents[3] / "schemas" / "evaluation-summary.schema.json").read_text())
    Draft202012Validator(schema).validate(summary)
    assert summary["n_trials"] == 2
    assert summary["n_valid_scores"] == 1
    assert summary["n_invalid_scores"] == 1
    assert summary["n_infrastructure_exceptions"] == 1
    assert summary["metrics"] == {"quality": 0.5, "reward": 0.5}
    assert summary["effective_evaluator"]["identity_match"] is True
    assert summary["artifact_validation"]["valid"] is True


def test_summary_counts_repeated_attempts_and_assigns_per_task_ordinals(tmp_path: Path):
    (tmp_path / "candidate-manifest.json").write_text(json.dumps({"candidate_id": "demo", "digest": "sha256:" + "0" * 64}))
    (tmp_path / "evaluation-context.json").write_text(json.dumps({
        "schema_version": 3, "digest": "sha256:" + "c" * 64, "mode": "diagnostic", "dataset": {"task_count": 2},
    }))
    (tmp_path / "evaluation-spec.json").write_text(json.dumps({
        "schema_version": 1, "protocol": "evaluation-spec/v1", "repeat_policy": {"repeats": 3, "seed_policy": "harbor-managed", "seed": None},
    }))
    payloads = []
    for task_name in ("task-a", "task-b"):
        for attempt in range(1, 4):
            identity = f"{task_name}__attempt-{attempt}"
            trial = tmp_path / identity
            (trial / "verifier").mkdir(parents=True)
            payload = {
                "id": identity, "task_name": task_name, "trial_name": identity,
                "trial_uri": trial.as_uri(), "agent_info": {"name": "demo"}, "agent_result": {"metadata": {}},
                "verifier_result": {"rewards": {"reward": 1}}, "exception_info": None,
            }
            (trial / "verifier" / "evaluation-result.json").write_text(json.dumps(strict_result(1)))
            (trial / "result.json").write_text(json.dumps(payload))
            payloads.append(payload)
    write_job_artifacts(tmp_path, payloads, evaluation_contract=CONTRACT, stack_manifest=STACK_MANIFEST)

    summary = summarize_job(tmp_path)

    assert summary["n_tasks"] == 2
    assert summary["n_trials"] == 6
    assert summary["coverage"]["total_trials"] == 6
    assert summary["repeat_policy"]["repeats"] == 3
    grouped = {}
    for trial in summary["trials"]:
        grouped.setdefault(trial["datasetTrial"], []).append(trial["attempt"])
    assert sorted(grouped.values()) == [[1, 2, 3], [1, 2, 3]]


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
    assert any(reason.startswith("evaluator-result-invalid:") for reason in summary["trials"][0]["score"]["invalid_reasons"])
