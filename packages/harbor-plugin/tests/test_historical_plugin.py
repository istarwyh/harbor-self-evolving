from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace

import pytest

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
    (trial / "verifier" / "evaluation-result.json").write_text(
        json.dumps(evaluator_result(scored=False))
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
    completion = json.loads((job.job_dir / COMPLETION_SENTINEL).read_text())
    assert completion["status"] == "completed"
    assert completion["valid"] is True
    lifecycle = json.loads((job.job_dir / "trial-lifecycle.json").read_text())
    assert lifecycle["counts"] == {"completed-unscored": 1}

    # Harbor 0.21 treats the same config/job directory as a resume. Existing
    # TrialResults do not emit the Trial callbacks again, so plugin finalization
    # must invalidate the old sentinel and rebuild job-owned artifacts exactly
    # once from the combined JobResult.
    resumed = HistoricalGenerationEvaluationPlugin(
        batch_path=str(batch_path),
        dataset_path=str(dataset),
        stack_path=materialized["stack_path"],
        project_root=str(tmp_path),
        mode="diagnostic",
    )
    await resumed.on_job_start(job)
    assert not (job.job_dir / COMPLETION_SENTINEL).exists()
    assert not (job.job_dir / "evaluation-summary.json").exists()
    await resumed.on_job_end(SimpleNamespace(trial_results=[result]))
    assert len(list((job.job_dir / "trial-assessments").glob("*.json"))) == 1
    resumed_summary = json.loads((job.job_dir / "evaluation-summary.json").read_text())
    assert resumed_summary["artifact_validation"]["valid"] is True
    assert json.loads((job.job_dir / COMPLETION_SENTINEL).read_text())["valid"] is True
    resumed_lifecycle = json.loads((job.job_dir / "trial-lifecycle.json").read_text())
    assert resumed_lifecycle["counts"] == {"completed-unscored": 1}


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
