import json
import subprocess
from pathlib import Path
from types import SimpleNamespace

import pytest

from harbor_dsh_evolution.candidate_materialization import materialize_candidate_dataset
from harbor_dsh_evolution.plugin import EvolutionPlugin

from helpers import MODEL_BINDING, make_candidate, make_dataset, make_stack
from test_lifecycle import event


def fake_job(tmp_path: Path, dataset: Path):
    def register(_callback):
        return None

    return SimpleNamespace(
        config=SimpleNamespace(tasks=[SimpleNamespace(path=dataset)], datasets=[], n_attempts=1),
        job_dir=tmp_path / "jobs" / "job",
        on_trial_started=register,
        on_environment_started=register,
        on_agent_started=register,
        on_agent_ended=register,
        on_verification_started=register,
        on_trial_ended=register,
        on_trial_cancelled=register,
    )


@pytest.mark.asyncio
async def test_plugin_persists_strict_identity_artifacts(tmp_path: Path):
    candidate = make_candidate(tmp_path)
    source_dataset = make_dataset(tmp_path)
    stack = make_stack(tmp_path)
    materialized = materialize_candidate_dataset(
        project_root=tmp_path,
        dataset_path=source_dataset,
        stack_path=stack,
        output_path=tmp_path / ".harbor" / "private" / "strict-dataset",
    )
    dataset = Path(materialized["dataset_path"])
    plugin = EvolutionPlugin(
        candidate_manifest=str(candidate / "candidate-manifest.json"),
        stack_path=str(stack),
        project_root=str(tmp_path),
        mode="diagnostic",
        candidate_model_provider=MODEL_BINDING["provider"],
        candidate_model=MODEL_BINDING["model"],
        candidate_model_transport=MODEL_BINDING["transport"],
        candidate_model_protocol=MODEL_BINDING["protocol"],
        candidate_reasoning_effort=MODEL_BINDING["reasoning_effort"],
    )
    await plugin.on_job_start(fake_job(tmp_path, dataset))
    job = tmp_path / "jobs" / "job"
    context = json.loads((job / "evaluation-context.json").read_text())
    assert context["schema_version"] == 3
    assert context["execution_environment"]["kind"] == "host"
    assert context["dataset"]["dataset_id"] == "vertical-search"
    assert context["candidate_model_binding"] == MODEL_BINDING
    assert (job / "dataset-manifest.json").is_file()
    preview = json.loads((job / "dataset-preview.json").read_text())
    assert preview["tasks"][0]["instruction"] == "Find the requested source and cite it.\n"
    assert "verifier" not in preview["tasks"][0]
    assert (job / "evaluation-stack-manifest.json").is_file()
    sources = json.loads((job / "evaluation-stack-sources.json").read_text())
    assert sources["schema_version"] == 1
    assert sources["stack_digest"]
    assert sources["components"]["evaluator"]["files"]
    assert (job / "architecture-doctor.json").is_file()
    evaluation_spec = json.loads((job / "evaluation-spec.json").read_text())
    assert evaluation_spec["protocol"] == "evaluation-spec/v1"
    assert evaluation_spec["evaluator"]["id"] == "search-evaluator"
    assert evaluation_spec["measurement_digest"].startswith("sha256:")
    lifecycle = json.loads((job / "trial-lifecycle.json").read_text())
    assert lifecycle["dataset_total"] == 1
    assert lifecycle["trials"][0]["phase"] == "queued"
    registered_before = (dataset / "dataset-manifest.json").read_bytes()
    # Real Harbor callbacks use TOML [task].name, not the directory search-task.
    await plugin._on_trial_started(event("examples/vertical-search", "runtime-execution", "search-task__random"))
    lifecycle = json.loads((job / "trial-lifecycle.json").read_text())
    assert lifecycle["dataset_total"] == 1
    assert lifecycle["attempt_count"] == 1
    assert lifecycle["trials"][0]["dataset_trial"] == "search-task"
    assert lifecycle["trials"][0]["execution_id"] == "runtime-execution"
    assert (dataset / "dataset-manifest.json").read_bytes() == registered_before


@pytest.mark.asyncio
async def test_plugin_rejects_dataset_path_not_bound_to_job(tmp_path: Path):
    candidate = make_candidate(tmp_path)
    actual = make_dataset(tmp_path)
    claimed = tmp_path / "claimed"
    claimed.mkdir()
    stack = make_stack(tmp_path)
    plugin = EvolutionPlugin(
        candidate_manifest=str(candidate / "candidate-manifest.json"),
        dataset_path=str(claimed),
        stack_path=str(stack),
        project_root=str(tmp_path),
        mode="diagnostic",
        candidate_model_provider=MODEL_BINDING["provider"],
        candidate_model=MODEL_BINDING["model"],
        candidate_model_transport=MODEL_BINDING["transport"],
        candidate_model_protocol=MODEL_BINDING["protocol"],
    )
    with pytest.raises(ValueError, match="must exactly match"):
        await plugin.on_job_start(fake_job(tmp_path, actual))


@pytest.mark.asyncio
async def test_docker_environment_hook_captures_immutable_image_id(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    candidate = make_candidate(tmp_path)
    stack = make_stack(tmp_path)
    plugin = EvolutionPlugin(
        candidate_manifest=str(candidate / "candidate-manifest.json"),
        stack_path=str(stack),
        project_root=str(tmp_path),
        mode="diagnostic",
        execution_environment="docker",
        candidate_model_provider=MODEL_BINDING["provider"],
        candidate_model=MODEL_BINDING["model"],
        candidate_model_transport=MODEL_BINDING["transport"],
        candidate_model_protocol=MODEL_BINDING["protocol"],
    )
    calls: list[list[str]] = []

    def inspect_image(args, **_kwargs):
        calls.append(args)
        return subprocess.CompletedProcess(args, 0, stdout="sha256:" + "f" * 64 + "\n", stderr="")

    monkeypatch.setattr("harbor_dsh_evolution.plugin.subprocess.run", inspect_image)
    hook_event = SimpleNamespace(
        task_name="search-task",
        result=SimpleNamespace(id="search-task__attempt-1"),
        lock=SimpleNamespace(
            task=SimpleNamespace(path=tmp_path / "dataset" / "search-task"),
            environment=SimpleNamespace(docker_image="registry.example/evaluator@sha256:" + "e" * 64),
        ),
    )
    await plugin._on_environment_started(hook_event)
    second_event = SimpleNamespace(
        task_name="search-task",
        result=SimpleNamespace(id="search-task__attempt-2"),
        lock=hook_event.lock,
    )
    await plugin._on_environment_started(second_event)
    assert calls[0][:4] == ["docker", "image", "inspect", "--format"]
    assert plugin._docker_image_ids == {
        "search-task__attempt-1": "sha256:" + "f" * 64,
        "search-task__attempt-2": "sha256:" + "f" * 64,
    }


def test_promotion_eligible_plugin_requires_policy(tmp_path: Path):
    candidate = make_candidate(tmp_path)
    stack = make_stack(tmp_path)
    with pytest.raises(ValueError, match="require policy_path"):
        EvolutionPlugin(
            candidate_manifest=str(candidate / "candidate-manifest.json"),
            stack_path=str(stack),
            project_root=str(tmp_path),
            mode="promotion-eligible",
            candidate_model_provider=MODEL_BINDING["provider"],
            candidate_model=MODEL_BINDING["model"],
            candidate_model_transport=MODEL_BINDING["transport"],
            candidate_model_protocol=MODEL_BINDING["protocol"],
        )
