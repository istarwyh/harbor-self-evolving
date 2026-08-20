import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from harbor_dsh_evolution.plugin import EvolutionPlugin

from helpers import make_candidate, make_dataset, make_stack


def fake_job(tmp_path: Path, dataset: Path):
    return SimpleNamespace(
        config=SimpleNamespace(tasks=[SimpleNamespace(path=dataset)], datasets=[]),
        job_dir=tmp_path / "jobs" / "job",
        on_trial_ended=lambda _callback: None,
    )


@pytest.mark.asyncio
async def test_plugin_persists_strict_identity_artifacts(tmp_path: Path):
    candidate = make_candidate(tmp_path)
    dataset = make_dataset(tmp_path)
    stack = make_stack(tmp_path)
    plugin = EvolutionPlugin(
        candidate_manifest=str(candidate / "candidate-manifest.json"),
        stack_path=str(stack),
        project_root=str(tmp_path),
        mode="diagnostic",
    )
    await plugin.on_job_start(fake_job(tmp_path, dataset))
    job = tmp_path / "jobs" / "job"
    context = json.loads((job / "evaluation-context.json").read_text())
    assert context["schema_version"] == 2
    assert context["dataset"]["dataset_id"] == "vertical-search"
    assert (job / "dataset-manifest.json").is_file()
    assert (job / "evaluation-stack-manifest.json").is_file()
    assert (job / "architecture-doctor.json").is_file()


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
    )
    with pytest.raises(ValueError, match="must exactly match"):
        await plugin.on_job_start(fake_job(tmp_path, actual))


def test_promotion_eligible_plugin_requires_policy(tmp_path: Path):
    candidate = make_candidate(tmp_path)
    stack = make_stack(tmp_path)
    with pytest.raises(ValueError, match="require policy_path"):
        EvolutionPlugin(
            candidate_manifest=str(candidate / "candidate-manifest.json"),
            stack_path=str(stack),
            project_root=str(tmp_path),
            mode="promotion-eligible",
        )
