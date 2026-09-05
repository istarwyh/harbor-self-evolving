import asyncio
import json
import shutil
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest
from harbor.models.job.config import DatasetConfig

from harbor_dsh_evolution.bounded_diagnostic import LIMITS, materialize_diagnostic, plan_diagnostic
from harbor_dsh_evolution.candidate import load_manifest
from harbor_dsh_evolution.context import build_evaluation_context
from harbor_dsh_evolution.dataset import load_validated_dataset, snapshot_dataset
from harbor_dsh_evolution.diagnostic_plugin import BoundedDiagnosticPlugin
from harbor_dsh_evolution.stack import snapshot_stack

from helpers import MODEL_BINDING, make_candidate, make_dataset, make_stack
from test_plugin import fake_job


@pytest.fixture
def source_job(tmp_path: Path):
    candidate = make_candidate(tmp_path)
    dataset = make_dataset(tmp_path)
    shutil.copytree(dataset / "search-task", dataset / "another-task")
    (dataset / "another-task" / "task.toml").write_text('schema_version = "1.4"\n[task]\nname = "examples/another"\nversion = "1.0.0"\n')
    manifest = snapshot_dataset(dataset, dataset_id="vertical-search")
    stack = make_stack(tmp_path)
    context = build_evaluation_context(dataset, candidate=load_manifest(candidate), stack_path=stack, project_root=tmp_path, mode="diagnostic", candidate_model_binding=MODEL_BINDING)
    job = tmp_path / "jobs" / "source"
    job.mkdir(parents=True)
    artifacts = {
        "config.json": {"agents": [{"import_path": "harbor_dsh_evolution.agent:DshCandidateAgent", "kwargs": {"candidate_path": str(candidate)}}], "datasets": [{"path": str(dataset)}]},
        "evaluation-context.json": context,
        "candidate-manifest.json": load_manifest(candidate).to_dict(),
        "dataset-manifest.json": manifest,
        "evaluation-stack-manifest.json": snapshot_stack(stack, project_root=tmp_path),
        "trial-lifecycle.json": {"trials": [{"execution_id": "trial-search", "dataset_trial": "search-task", "terminal": True, "phase": "completed"}, {"execution_id": "trial-another", "dataset_trial": "examples/another", "terminal": True, "phase": "candidate-quality-failed"}]},
    }
    for name, value in artifacts.items():
        (job / name).write_text(json.dumps(value))
    return {"project_root": tmp_path, "source_job_dir": job, "trial_ids": ["trial-search"]}


def test_plan_is_read_only_and_pins_identity_and_quotas(source_job):
    root = source_job["project_root"]
    before = sorted(path.relative_to(root).as_posix() for path in root.rglob("*"))
    plan = plan_diagnostic(**source_job)
    assert plan["limits"] == LIMITS
    assert plan["candidatePath"] == "candidate-1.0.0"
    assert plan["stackPath"] == ".harbor/evaluation-stack.yml"
    assert plan["selection"][0]["taskId"] == "search-task"
    assert plan["promotionEligible"] is False
    assert plan["candidateModelBinding"] == MODEL_BINDING
    assert before == sorted(path.relative_to(root).as_posix() for path in root.rglob("*"))
    assert plan_diagnostic(**source_job)["planDigest"] == plan["planDigest"]


def test_materialized_subset_is_consumed_by_real_harbor_dataset_resolver(source_job):
    root = source_job["project_root"]
    before = (root / "dataset/dataset-manifest.json").read_bytes()
    plan = plan_diagnostic(**source_job)
    result = materialize_diagnostic(**source_job, expected_plan_digest=plan["planDigest"], operation_id="hop_acceptance-123")
    subset = root / result["datasetPath"]
    tasks = asyncio.run(DatasetConfig(path=subset).get_task_configs())
    assert [task.path.name for task in tasks] == ["search-task"]
    manifest = load_validated_dataset(subset, project_root=root)
    assert manifest["task_count"] == 1
    assert manifest["source_digest"] != plan["identities"]["dataset"]["source_digest"]
    assert manifest["metadata"]["diagnostic_provenance"]["operationId"] == "hop_acceptance-123"
    assert (root / "dataset/dataset-manifest.json").read_bytes() == before
    assert not (root / "jobs/hop_acceptance-123").exists()
    with pytest.raises(ValueError, match="ALREADY_MATERIALIZED"):
        materialize_diagnostic(**source_job, expected_plan_digest=plan["planDigest"], operation_id="hop_acceptance-123")


@pytest.mark.parametrize("trial_ids", [[], ["trial-search"] * 2, [f"trial-{n}" for n in range(13)], ["missing"]])
def test_rejects_invalid_unregistered_or_over_quota_selection(source_job, trial_ids):
    with pytest.raises(ValueError, match="HARBOR_DIAGNOSTIC_(SELECTION_INVALID|QUOTA)"):
        plan_diagnostic(**{**source_job, "trial_ids": trial_ids})


def test_maps_harbor_task_names_without_fuzzy_matching(source_job):
    result = plan_diagnostic(**{**source_job, "trial_ids": ["trial-another"]})
    assert result["selection"][0]["taskId"] == "another-task"


def test_rejects_active_trial_and_duplicate_attempt(source_job):
    path = source_job["source_job_dir"] / "trial-lifecycle.json"
    value = json.loads(path.read_text())
    value["trials"][0]["terminal"] = False
    path.write_text(json.dumps(value))
    with pytest.raises(ValueError, match="SELECTION_INVALID"):
        plan_diagnostic(**source_job)
    value["trials"][0]["terminal"] = True
    value["trials"].append({**value["trials"][0], "execution_id": "duplicate-attempt"})
    path.write_text(json.dumps(value))
    with pytest.raises(ValueError, match="one attempt"):
        plan_diagnostic(**{**source_job, "trial_ids": ["trial-search", "duplicate-attempt"]})


@pytest.mark.parametrize("relative", ["candidate-1.0.0/plugin.mjs", "dataset/search-task/instruction.md", "stack/rubric.md"])
def test_rejects_drift_in_pinned_executable_inputs(source_job, relative):
    path = source_job["project_root"] / relative
    path.write_text(path.read_text() + "\nchanged\n")
    with pytest.raises(ValueError):
        plan_diagnostic(**source_job)


def test_rejects_cross_project_and_symlink_sources(source_job, tmp_path):
    path = source_job["source_job_dir"] / "config.json"
    config = json.loads(path.read_text())
    config["datasets"][0]["path"] = str(tmp_path.parent)
    path.write_text(json.dumps(config))
    with pytest.raises(ValueError, match="SOURCE_DENIED"):
        plan_diagnostic(**source_job)
    linked = tmp_path / "linked-dataset"
    linked.symlink_to(tmp_path / "dataset", target_is_directory=True)
    config["datasets"][0]["path"] = str(linked)
    path.write_text(json.dumps(config))
    with pytest.raises(ValueError, match="SOURCE_DENIED"):
        plan_diagnostic(**source_job)


def test_requires_current_preflight_before_any_materialization(source_job):
    with pytest.raises(ValueError, match="REVISION_CONFLICT"):
        materialize_diagnostic(**source_job, expected_plan_digest="stale", operation_id="hop_stale")
    assert not (source_job["project_root"] / ".harbor/diagnostic-datasets").exists()


def test_protects_diagnostic_storage_from_symlinks(source_job):
    root = source_job["project_root"]
    (root / ".harbor/diagnostic-datasets").symlink_to(root / "dataset", target_is_directory=True)
    plan = plan_diagnostic(**source_job)
    with pytest.raises(ValueError, match="SOURCE_DENIED"):
        materialize_diagnostic(**source_job, expected_plan_digest=plan["planDigest"], operation_id="hop_denied")
    assert not (root / "dataset/hop_denied").exists()


def test_rejects_historical_generation_jobs(source_job):
    path = source_job["source_job_dir"] / "evaluation-context.json"
    path.write_text(json.dumps({"schema_version": 1, "job_kind": "historical-generation-evaluation"}))
    with pytest.raises(ValueError, match="UNSUPPORTED_JOB"):
        plan_diagnostic(**source_job)


def plugin_fixture(source_job):
    root = source_job["project_root"]
    plan = plan_diagnostic(**source_job)
    result = materialize_diagnostic(**source_job, expected_plan_digest=plan["planDigest"], operation_id="hop_plugin-test")
    kwargs = {
        "candidate_manifest": str(root / result["candidatePath"] / "candidate-manifest.json"),
        "dataset_path": str(root / result["datasetPath"]), "stack_path": str(root / result["stackPath"]), "project_root": str(root), "mode": "diagnostic",
        "candidate_model_provider": MODEL_BINDING["provider"], "candidate_model": MODEL_BINDING["model"], "candidate_model_transport": MODEL_BINDING["transport"], "candidate_model_protocol": MODEL_BINDING["protocol"],
        "candidate_reasoning_effort": MODEL_BINDING["reasoning_effort"], "expected_dataset_digest": result["datasetIdentity"]["source_digest"], "expected_stack_digest": result["identities"]["stack"]["digest"], "operation_id": "hop_plugin-test", "source_plan_digest": plan["planDigest"],
    }
    job = fake_job(root, root / result["datasetPath"])
    job.config.n_concurrent_trials = 2
    job.config.n_attempts = 1
    job.config.retry = SimpleNamespace(max_retries=0)
    return kwargs, job


@pytest.mark.asyncio
async def test_bounded_plugin_uses_actual_evolution_lifecycle_and_records_subset(source_job):
    kwargs, job = plugin_fixture(source_job)
    await BoundedDiagnosticPlugin(**kwargs).on_job_start(job)
    context = json.loads((job.job_dir / "evaluation-context.json").read_text())
    provenance = json.loads((job.job_dir / "diagnostic-provenance.json").read_text())
    lifecycle = json.loads((job.job_dir / "trial-lifecycle.json").read_text())
    assert context["dataset"]["task_count"] == 1
    assert provenance["operationId"] == "hop_plugin-test"
    assert lifecycle["dataset_total"] == 1
    assert provenance["promotionEligible"] is False


@pytest.mark.asyncio
async def test_actual_harbor_attach_rejects_pin_drift_before_trial_launch(source_job):
    from harbor.cli.job_plugins import attach_job_plugin
    kwargs, job = plugin_fixture(source_job)
    kwargs["expected_stack_digest"] = "sha256:" + "a" * 64
    with pytest.raises(ValueError, match="REVISION_CONFLICT"):
        await attach_job_plugin(job, "harbor_dsh_evolution.diagnostic_plugin:BoundedDiagnosticPlugin", kwargs=kwargs)
    assert not job.job_dir.exists()


@pytest.mark.asyncio
async def test_plugin_independently_rejects_attempt_and_concurrency_expansion(source_job):
    kwargs, job = plugin_fixture(source_job)
    job.config.n_concurrent_trials = 3
    with pytest.raises(ValueError, match="QUOTA"):
        await BoundedDiagnosticPlugin(**kwargs).on_job_start(job)
    assert not job.job_dir.exists()


def test_plugin_cannot_be_reused_for_promotion(source_job):
    kwargs, _job = plugin_fixture(source_job)
    with pytest.raises(ValueError, match="MODE_INVALID"):
        BoundedDiagnosticPlugin(**{**kwargs, "mode": "promotion-eligible"})


def test_real_cli_plan_is_read_only_and_materialize_is_not_job_launch(source_job):
    root = source_job["project_root"]
    request = {"projectRoot": str(root), "sourceJobDir": str(source_job["source_job_dir"]), "trialIds": source_job["trial_ids"]}
    result = subprocess.run([sys.executable, "-m", "harbor_dsh_evolution.cli", "diagnostic-subset", "plan"], input=json.dumps(request), text=True, capture_output=True, check=True)
    plan = json.loads(result.stdout)
    assert not (root / ".harbor/diagnostic-datasets").exists()
    result = subprocess.run([sys.executable, "-m", "harbor_dsh_evolution.cli", "diagnostic-subset", "materialize"], input=json.dumps({**request, "expectedPlanDigest": plan["planDigest"], "operationId": "hop_cli-test"}), text=True, capture_output=True, check=True)
    materialized = json.loads(result.stdout)
    assert materialized["datasetIdentity"]["task_count"] == 1
    assert [path.name for path in (root / "jobs").iterdir()] == ["source"]
