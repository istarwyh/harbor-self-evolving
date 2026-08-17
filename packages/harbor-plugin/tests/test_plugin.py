import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from harbor_dsh_evolution.candidate import snapshot_candidate
from harbor_dsh_evolution.plugin import EvolutionPlugin


def make_candidate(tmp_path: Path) -> Path:
    candidate = tmp_path / "candidate"
    candidate.mkdir()
    (candidate / "cordis.yml").write_text("- name: example\n")
    (candidate / "package.json").write_text(
        '{"name":"business-agent","version":"1.0.0"}\n'
    )
    snapshot_candidate(candidate)
    return candidate


def make_dataset(tmp_path: Path, name: str) -> Path:
    dataset = tmp_path / name
    dataset.mkdir()
    (dataset / "task.toml").write_text(
        f'[task]\nname = "{name}"\nversion = "1.0.0"\n'
    )
    return dataset


def fake_job(tmp_path: Path, dataset: Path):
    return SimpleNamespace(
        config=SimpleNamespace(
            tasks=[SimpleNamespace(path=dataset)],
            datasets=[],
        ),
        job_dir=tmp_path / "jobs" / "job",
        on_trial_ended=lambda _callback: None,
    )


@pytest.mark.asyncio
async def test_plugin_derives_context_from_the_actual_job_path(tmp_path: Path):
    candidate = make_candidate(tmp_path)
    dataset = make_dataset(tmp_path, "dataset")
    plugin = EvolutionPlugin(candidate_manifest=str(candidate / "candidate-manifest.json"))
    await plugin.on_job_start(fake_job(tmp_path, dataset))
    context = json.loads(
        (tmp_path / "jobs" / "job" / "evaluation-context.json").read_text()
    )
    assert context["tasks"][0]["name"] == "dataset"


@pytest.mark.asyncio
async def test_plugin_rejects_a_context_path_that_is_not_the_job_input(tmp_path: Path):
    candidate = make_candidate(tmp_path)
    actual = make_dataset(tmp_path, "actual")
    claimed = make_dataset(tmp_path, "claimed")
    plugin = EvolutionPlugin(
        candidate_manifest=str(candidate / "candidate-manifest.json"),
        dataset_path=str(claimed),
    )
    with pytest.raises(ValueError, match="must exactly match"):
        await plugin.on_job_start(fake_job(tmp_path, actual))
