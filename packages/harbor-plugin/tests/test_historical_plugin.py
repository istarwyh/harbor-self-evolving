from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace

import pytest
from jsonschema import Draft202012Validator

from harbor_dsh_evolution.historical_plugin import (
    COMPLETION_SENTINEL,
    HistoricalGenerationEvaluationPlugin,
)
from harbor_dsh_evolution.session_batch import materialize_historical_dataset

from helpers import HISTORICAL_JUDGE_BINDING, make_historical_batch
from test_historical_artifacts import evaluator_result


def fake_job(tmp_path: Path, dataset: Path):
    callbacks = {}

    def register(name):
        def wrapped(callback):
            callbacks[name] = callback

        return wrapped

    return SimpleNamespace(
        config=SimpleNamespace(tasks=[SimpleNamespace(path=dataset)], datasets=[]),
        job_dir=tmp_path / "jobs" / "historical-job",
        callbacks=callbacks,
        on_trial_started=register("trial_started"),
        on_environment_started=register("environment_started"),
        on_agent_started=register("agent_started"),
        on_agent_ended=register("agent_ended"),
        on_verification_started=register("verification_started"),
        on_trial_ended=register("trial_ended"),
        on_trial_cancelled=register("trial_cancelled"),
    )


class FakeTrialResult:
    def __init__(self, payload: dict):
        self.payload = payload
        self.id = payload["id"]
        self.trial_name = payload["trial_name"]
        self.exception_info = None
        self.verifier_result = SimpleNamespace(
            rewards=payload["verifier_result"]["rewards"]
        )

    def model_dump(self, *, mode: str):
        assert mode == "json"
        return self.payload


@pytest.mark.asyncio
async def test_historical_plugin_writes_summary_meta_status_and_completion_sentinel(
    tmp_path: Path,
):
    batch_path, batch, observations = make_historical_batch(tmp_path)
    materialized = materialize_historical_dataset(
        project_root=tmp_path,
        batch_path=batch_path,
        output_path=tmp_path / ".harbor" / "private" / "dataset",
        **HISTORICAL_JUDGE_BINDING,
    )
    dataset = Path(materialized["dataset_path"])
    plugin = HistoricalGenerationEvaluationPlugin(
        batch_path=str(batch_path),
        dataset_path=str(dataset),
        stack_path=materialized["stack_path"],
        project_root=str(tmp_path),
        mode="diagnostic",
    )
    job = fake_job(tmp_path, dataset)
    await plugin.on_job_start(job)
    context = json.loads((job.job_dir / "evaluation-context.json").read_text())
    assert context["evaluation_target"]["digest"] == batch["digest"]
    assert context["promotion_eligible"] is False
    assert not (job.job_dir / "candidate-manifest.json").exists()

    task = materialized["dataset_manifest"]["tasks"][0]
    execution_id = "execution-1"
    trial = job.job_dir / execution_id
    (trial / "artifacts" / "logs" / "artifacts").mkdir(parents=True)
    (trial / "verifier").mkdir()
    record_id = task["metadata"]["generation_record_id"]
    (trial / "artifacts" / "logs" / "artifacts" / "session-observation.json").write_text(
        json.dumps(observations[record_id])
    )
    task_root = Path(task["path"])
    if not task_root.is_absolute():
        task_root = dataset / task_root
    evaluator_materialization = json.loads(
        (task_root / "tests" / "evaluator-materialization.json").read_text()
    )
    runtime_identity = evaluator_materialization["materialized"]
    effective_evaluator = {
        "schema_version": 1,
        "protocol": "effective-evaluator/v1",
        "configured": evaluator_materialization["configured"],
        "materialized": runtime_identity,
        "executed": runtime_identity,
        "identity_match": True,
    }
    (trial / "verifier" / "evaluation-result.json").write_text(
        json.dumps(
            evaluator_result(
                scored=False, effective_evaluator=effective_evaluator
            )
        )
    )
    payload = {
        "id": execution_id,
        "task_name": task["metadata"]["task_name"],
        "trial_name": "historical-trial-1",
        "trial_uri": trial.as_uri(),
        "agent_result": {
            "metadata": {
                "execution_adapter": {
                    "id": "dsh-session-observation-adapter",
                    "model_invocation": False,
                }
            }
        },
        "verifier_result": {"rewards": {"criterion_coverage": 0}},
        "exception_info": None,
    }
    result = FakeTrialResult(payload)
    event = SimpleNamespace(
        task_name=task["metadata"]["task_name"],
        result=result,
        timestamp=datetime.now(UTC),
    )
    await job.callbacks["trial_ended"](event)
    await plugin.on_job_end(SimpleNamespace(trial_results=[result]))

    summary = json.loads((job.job_dir / "evaluation-summary.json").read_text())
    assert summary["schema_version"] == 4
    assert summary["status_counts"] == {"completed-unscored": 1}
    assert summary["n_invalid_scores"] == 0
    assert summary["coverage"]["unscored_trials"] == 1
    assert summary["evaluator_meta_evaluation"]["status"] == "not-run"
    assert summary["effective_evaluator"]["identity_match"] is True
    assert (
        summary["effective_evaluator"]["configured"]["portable_digest"]
        == summary["effective_evaluator"]["executed"]["portable_digest"]
    )
    completion = json.loads((job.job_dir / COMPLETION_SENTINEL).read_text())
    assert completion["status"] == "completed"
    assert completion["valid"] is True
    lifecycle = json.loads((job.job_dir / "trial-lifecycle.json").read_text())
    assert lifecycle["counts"] == {"completed-unscored": 1}
    schema_root = Path(__file__).parents[3] / "schemas"
    registry = json.loads((job.job_dir / "artifact-registry.json").read_text())
    registry_schema = json.loads((schema_root / "artifact-registry.schema.json").read_text())
    Draft202012Validator(registry_schema).validate(registry)
    assessment_schema = json.loads((schema_root / "trial-assessment.schema.json").read_text())
    assessment_schema["properties"]["effective_evaluator"]["anyOf"][0] = json.loads(
        (schema_root / "effective-evaluator.schema.json").read_text()
    )
    historical_assessment = json.loads(next((job.job_dir / "trial-assessments").glob("*.json")).read_text())
    Draft202012Validator(assessment_schema).validate(historical_assessment)

    # Completed Jobs are sealed and never resumed in place. A retry must create
    # a new Job so the original evidence remains immutable.
    resumed = HistoricalGenerationEvaluationPlugin(
        batch_path=str(batch_path),
        dataset_path=str(dataset),
        stack_path=materialized["stack_path"],
        project_root=str(tmp_path),
        mode="diagnostic",
    )
    with pytest.raises(ValueError, match="JOB_ALREADY_SEALED"):
        await resumed.on_job_start(job)


@pytest.mark.asyncio
async def test_historical_plugin_rejects_custom_stack_that_tasks_do_not_execute(
    tmp_path: Path,
):
    batch_path, _, _ = make_historical_batch(tmp_path)
    materialized = materialize_historical_dataset(
        project_root=tmp_path,
        batch_path=batch_path,
        output_path=tmp_path / "dataset",
        **HISTORICAL_JUDGE_BINDING,
    )
    custom_stack = tmp_path / "custom-stack.yml"
    custom_stack.write_text(Path(materialized["stack_path"]).read_text())
    plugin = HistoricalGenerationEvaluationPlugin(
        batch_path=str(batch_path),
        dataset_path=materialized["dataset_path"],
        stack_path=str(custom_stack),
        project_root=str(tmp_path),
        mode="diagnostic",
    )
    with pytest.raises(ValueError, match="Custom Historical Evaluation Stacks"):
        await plugin.on_job_start(fake_job(tmp_path, Path(materialized["dataset_path"])))


def test_historical_plugin_is_diagnostic_only(tmp_path: Path):
    with pytest.raises(ValueError, match="diagnostic-only"):
        HistoricalGenerationEvaluationPlugin(
            batch_path="batch.json",
            dataset_path="dataset",
            stack_path="stack.yml",
            project_root=str(tmp_path),
            mode="promotion-eligible",
        )
