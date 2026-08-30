from __future__ import annotations

import json
import shutil
from pathlib import Path

from harbor_dsh_evolution.historical_artifacts import (
    load_historical_assessments,
    write_historical_job_artifacts,
)
from harbor_dsh_evolution.historical_context import build_historical_context
from harbor_dsh_evolution.historical_summary import (
    summarize_historical_job,
    summarize_historical_payloads,
)
from harbor_dsh_evolution.session_batch import materialize_historical_dataset
from harbor_dsh_evolution.stack import snapshot_stack

from helpers import HISTORICAL_JUDGE_BINDING, make_historical_batch


CRITERIA = (
    "goal_progress",
    "execution_reliability",
    "evidence_alignment",
    "interaction_quality",
)


def evaluator_result(*, scored: bool):
    items = [
        {
            "id": identity,
            "status": "scored" if scored else "insufficient-evidence",
            "score": 1 if scored else None,
            "reason": (
                "The frozen record supports the score."
                if scored
                else "The frozen record omits evidence needed for a trustworthy score."
            ),
            "recommendation": "Collect stronger visible completion evidence next time.",
            "evidence_refs": ["generation_record.visible_transcript"],
        }
        for identity in CRITERIA
    ]
    return {
        "schema_version": 2,
        "protocol": "evaluation-result/v2",
        "criteria": items,
        "aggregate": {
            "metric_id": "reward",
            "value": 1 if scored else None,
            "scored_criteria": 4 if scored else 0,
            "total_criteria": 4,
            "coverage": 1 if scored else 0,
        },
    }


def _payload(
    job_dir: Path,
    task: dict,
    observation: dict,
    *,
    execution_id: str,
    scored: bool,
):
    trial = job_dir / execution_id
    (trial / "artifacts" / "logs" / "artifacts").mkdir(parents=True)
    (trial / "verifier").mkdir()
    (trial / "artifacts" / "logs" / "artifacts" / "session-observation.json").write_text(
        json.dumps(observation)
    )
    (trial / "verifier" / "evaluation-result.json").write_text(
        json.dumps(evaluator_result(scored=scored))
    )
    return {
        "id": execution_id,
        "task_name": task["metadata"]["task_name"],
        "trial_name": execution_id,
        "trial_uri": trial.as_uri(),
        "agent_result": {
            "metadata": {
                "execution_adapter": {
                    "id": "dsh-session-observation-adapter",
                    "model_invocation": False,
                }
            }
        },
        "verifier_result": {"rewards": {"criterion_coverage": 1 if scored else 0}},
        "exception_info": None,
    }


def test_historical_artifacts_preserve_abstention_as_completed_unscored(tmp_path: Path):
    batch_path, _, observations = make_historical_batch(tmp_path, count=2)
    materialized = materialize_historical_dataset(
        project_root=tmp_path,
        batch_path=batch_path,
        output_path=tmp_path / "dataset",
        **HISTORICAL_JUDGE_BINDING,
    )
    dataset = materialized["dataset_manifest"]
    stack = snapshot_stack(
        Path(materialized["stack_path"]),
        project_root=tmp_path,
        job_kind="historical-generation-evaluation",
    )
    job_dir = tmp_path / "job"
    job_dir.mkdir()
    payloads = [
        _payload(
            job_dir,
            task,
            observations[task["metadata"]["generation_record_id"]],
            execution_id=f"execution-{index}",
            scored=index == 1,
        )
        for index, task in enumerate(dataset["tasks"], start=1)
    ]
    validation = write_historical_job_artifacts(
        job_dir,
        payloads,
        dataset_manifest=dataset,
        stack_manifest=stack,
    )
    assert validation["valid"] is True
    assessments = load_historical_assessments(job_dir)
    assert [item["status"] for item in assessments] == ["completed", "completed-unscored"]
    assert assessments[1]["score"]["value"] is None
    assert "criteria-unscored" in assessments[1]["score"]["invalid_reasons"]
    population = json.loads((job_dir / "population-report.json").read_text())
    assert population["coverage"]["scored_trials"] == 1
    assert population["coverage"]["unscored_trials"] == 1
    assert population["metrics"] == {"reward": 1.0}
    optimization = json.loads((job_dir / "optimization-report.json").read_text())
    assert optimization["evaluator_meta_evaluation"]["status"] == "not-run"
    assert optimization["hook"]["configured_component"]["executed"] is False

    context = build_historical_context(
        project_root=tmp_path,
        batch_path=batch_path,
        dataset_path=Path(materialized["dataset_path"]),
        stack_path=Path(materialized["stack_path"]),
    )
    summary = summarize_historical_payloads(
        payloads,
        job_name="job",
        evaluation_context=context,
        artifact_validation=validation,
        dataset_manifest=dataset,
        assessments=assessments,
    )
    assert summary["schema_version"] == 4
    assert summary["status_counts"] == {
        "completed": 1,
        "completed-unscored": 1,
    }
    assert summary["coverage"] == {
        "scored_trials": 1,
        "unscored_trials": 1,
        "total_trials": 2,
        "trial_rate": 0.5,
        "criterion_scored": 4,
        "criterion_total": 8,
        "criterion_rate": 0.5,
    }
    assert summary["n_valid_scores"] == 1
    assert summary["n_invalid_scores"] == 0
    assert summary["n_unscored_trials"] == 1
    assert summary["evaluator_meta_evaluation"]["status"] == "not-run"
    assert "candidate" not in summary


def test_missing_harbor_trial_fails_dataset_cardinality_validation(tmp_path: Path):
    batch_path, _, observations = make_historical_batch(tmp_path, count=2)
    materialized = materialize_historical_dataset(
        project_root=tmp_path,
        batch_path=batch_path,
        output_path=tmp_path / "dataset",
        **HISTORICAL_JUDGE_BINDING,
    )
    dataset = materialized["dataset_manifest"]
    stack = snapshot_stack(
        Path(materialized["stack_path"]),
        project_root=tmp_path,
        job_kind="historical-generation-evaluation",
    )
    job_dir = tmp_path / "job"
    job_dir.mkdir()
    task = dataset["tasks"][0]
    payload = _payload(
        job_dir,
        task,
        observations[task["metadata"]["generation_record_id"]],
        execution_id="execution-1",
        scored=True,
    )
    validation = write_historical_job_artifacts(
        job_dir,
        [payload],
        dataset_manifest=dataset,
        stack_manifest=stack,
    )
    assert validation["valid"] is False
    assert {item["code"] for item in validation["findings"]} == {
        "TRIAL_ASSESSMENT_COUNT_MISMATCH"
    }
    context = build_historical_context(
        project_root=tmp_path,
        batch_path=batch_path,
        dataset_path=Path(materialized["dataset_path"]),
        stack_path=Path(materialized["stack_path"]),
    )
    summary = summarize_historical_payloads(
        [payload],
        job_name="job",
        evaluation_context=context,
        artifact_validation=validation,
        dataset_manifest=dataset,
        assessments=load_historical_assessments(job_dir),
    )
    assert summary["status_counts"] == {"completed": 1, "missing": 1}
    assert summary["n_discovered_trials"] == 1
    assert summary["n_invalid_scores"] == 1


def test_historical_summary_rebuild_detects_missing_assessment(tmp_path: Path):
    batch_path, _, observations = make_historical_batch(tmp_path, count=2)
    materialized = materialize_historical_dataset(
        project_root=tmp_path,
        batch_path=batch_path,
        output_path=tmp_path / "dataset",
        **HISTORICAL_JUDGE_BINDING,
    )
    dataset = materialized["dataset_manifest"]
    stack = snapshot_stack(
        Path(materialized["stack_path"]),
        project_root=tmp_path,
        job_kind="historical-generation-evaluation",
    )
    context = build_historical_context(
        project_root=tmp_path,
        batch_path=batch_path,
        dataset_path=Path(materialized["dataset_path"]),
        stack_path=Path(materialized["stack_path"]),
    )
    job_dir = tmp_path / "job"
    job_dir.mkdir()
    (job_dir / "dataset-manifest.json").write_text(json.dumps(dataset))
    (job_dir / "evaluation-context.json").write_text(json.dumps(context))
    payloads = [
        _payload(
            job_dir,
            task,
            observations[task["metadata"]["generation_record_id"]],
            execution_id=f"execution-{index}",
            scored=True,
        )
        for index, task in enumerate(dataset["tasks"], start=1)
    ]
    validation = write_historical_job_artifacts(
        job_dir,
        payloads,
        dataset_manifest=dataset,
        stack_manifest=stack,
    )
    assert validation["valid"] is True

    sorted((job_dir / "trial-assessments").glob("*.json"))[0].unlink()
    summary = summarize_historical_job(job_dir)

    assert summary["artifact_validation"]["valid"] is False
    assert {item["code"] for item in summary["artifact_validation"]["findings"]} == {
        "TRIAL_ASSESSMENT_COUNT_MISMATCH"
    }
    assert summary["status_counts"] == {"completed": 1, "missing": 1}
    assert summary["n_trials"] == 2
    assert summary["n_discovered_trials"] == 1
    assert summary["n_invalid_scores"] == 1


def test_historical_artifacts_reject_substituted_observation(tmp_path: Path):
    batch_path, _, observations = make_historical_batch(tmp_path)
    materialized = materialize_historical_dataset(
        project_root=tmp_path,
        batch_path=batch_path,
        output_path=tmp_path / "dataset",
        **HISTORICAL_JUDGE_BINDING,
    )
    dataset = materialized["dataset_manifest"]
    stack = snapshot_stack(
        Path(materialized["stack_path"]),
        project_root=tmp_path,
        job_kind="historical-generation-evaluation",
    )
    job_dir = tmp_path / "job"
    job_dir.mkdir()
    observation = next(iter(observations.values()))
    payload = _payload(
        job_dir,
        dataset["tasks"][0],
        observation,
        execution_id="execution",
        scored=True,
    )
    artifact = job_dir / "execution" / "artifacts" / "logs" / "artifacts" / "session-observation.json"
    substituted = json.loads(artifact.read_text())
    substituted["task"]["initial_user_goal"] = "tampered"
    artifact.write_text(json.dumps(substituted))
    validation = write_historical_job_artifacts(
        job_dir,
        [payload],
        dataset_manifest=dataset,
        stack_manifest=stack,
    )
    assert validation["valid"] is True
    assessment = load_historical_assessments(job_dir)[0]
    assert assessment["status"] == "evaluation-error"
    assert assessment["requirements"]["observation_integrity"] is False
    assert assessment["score"]["value"] is None


def test_criterion_evaluation_error_is_not_normal_abstention(tmp_path: Path):
    batch_path, _, observations = make_historical_batch(tmp_path)
    materialized = materialize_historical_dataset(
        project_root=tmp_path,
        batch_path=batch_path,
        output_path=tmp_path / "dataset",
        **HISTORICAL_JUDGE_BINDING,
    )
    dataset = materialized["dataset_manifest"]
    stack = snapshot_stack(
        Path(materialized["stack_path"]),
        project_root=tmp_path,
        job_kind="historical-generation-evaluation",
    )
    job_dir = tmp_path / "job"
    job_dir.mkdir()
    payload = _payload(
        job_dir,
        dataset["tasks"][0],
        next(iter(observations.values())),
        execution_id="execution",
        scored=True,
    )
    result_path = job_dir / "execution" / "verifier" / "evaluation-result.json"
    result = json.loads(result_path.read_text())
    result["criteria"][0]["status"] = "evaluation-error"
    result["criteria"][0]["score"] = None
    result["aggregate"] = {
        "metric_id": "reward",
        "value": 1,
        "scored_criteria": 3,
        "total_criteria": 4,
        "coverage": 0.75,
    }
    result_path.write_text(json.dumps(result))
    write_historical_job_artifacts(
        job_dir,
        [payload],
        dataset_manifest=dataset,
        stack_manifest=stack,
    )
    assessment = load_historical_assessments(job_dir)[0]
    assert assessment["status"] == "evaluation-error"
    assert assessment["requirements"]["judge_completed"] is False
    assert assessment["requirements"]["artifact_schema_valid"] is True
    assert assessment["score"]["value"] is None


def test_low_scored_criterion_drives_generator_owned_diagnosis(tmp_path: Path):
    batch_path, _, observations = make_historical_batch(tmp_path)
    materialized = materialize_historical_dataset(
        project_root=tmp_path,
        batch_path=batch_path,
        output_path=tmp_path / "dataset",
        **HISTORICAL_JUDGE_BINDING,
    )
    dataset = materialized["dataset_manifest"]
    stack = snapshot_stack(
        Path(materialized["stack_path"]),
        project_root=tmp_path,
        job_kind="historical-generation-evaluation",
    )
    job_dir = tmp_path / "job"
    job_dir.mkdir()
    payload = _payload(
        job_dir,
        dataset["tasks"][0],
        next(iter(observations.values())),
        execution_id="execution",
        scored=True,
    )
    result_path = job_dir / "execution" / "verifier" / "evaluation-result.json"
    result = json.loads(result_path.read_text())
    result["criteria"][0].update(
        {
            "score": 0.5,
            "reason": "The final response only partially completes the requested task.",
            "recommendation": "Make completion criteria explicit before ending the task.",
            "evidence_refs": ["generation_record.visible_transcript/1"],
        }
    )
    result["aggregate"]["value"] = 0.875
    result_path.write_text(json.dumps(result))
    write_historical_job_artifacts(
        job_dir,
        [payload],
        dataset_manifest=dataset,
        stack_manifest=stack,
    )
    diagnosis = json.loads((job_dir / "diagnosis-report.json").read_text())
    signal = next(
        item
        for item in diagnosis["diagnoses"]
        if item["root_cause"] == "generator-quality:goal_progress"
    )
    assert signal["owner"] == "generator"
    assert signal["recommendation"].startswith("Make completion criteria")
    optimization = json.loads((job_dir / "optimization-report.json").read_text())
    assert optimization["hypotheses"][0]["owner"] == "generator"
    assert optimization["hypotheses"][0]["root_cause"] == "generator-quality:goal_progress"
