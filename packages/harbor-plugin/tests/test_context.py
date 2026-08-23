import json
from pathlib import Path

from harbor_dsh_evolution.context import context_preview
from harbor_dsh_evolution.candidate import load_manifest

from helpers import MODEL_BINDING, make_candidate, make_context, make_dataset, make_stack


def test_context_v2_is_stable_portable_and_excludes_candidate_from_comparability(tmp_path: Path):
    candidate_v1 = make_candidate(tmp_path, version="1.0.0")
    candidate_v2 = make_candidate(tmp_path, version="2.0.0", content="v2")
    dataset = make_dataset(tmp_path)
    stack = make_stack(tmp_path)
    first = make_context(tmp_path, candidate_v1, dataset, stack)
    second = make_context(tmp_path, candidate_v2, dataset, stack)
    assert first["schema_version"] == 2
    assert first["digest"] == second["digest"]
    assert first["full_digest"] != second["full_digest"]
    assert first["candidate"]["digest"] != second["candidate"]["digest"]
    assert str(tmp_path) not in json.dumps(first)


def test_reward_affecting_stack_change_requires_fresh_baseline(tmp_path: Path):
    candidate = make_candidate(tmp_path)
    dataset = make_dataset(tmp_path)
    stack = make_stack(tmp_path)
    first = make_context(tmp_path, candidate, dataset, stack)
    (tmp_path / "stack" / "evaluator" / "evaluator.py").write_text("# changed evaluator\n")
    second = make_context(tmp_path, candidate, dataset, stack)
    assert first["digest"] != second["digest"]


def test_reporter_change_is_audited_but_remains_comparable(tmp_path: Path):
    candidate = make_candidate(tmp_path)
    dataset = make_dataset(tmp_path)
    stack = make_stack(tmp_path)
    first = make_context(tmp_path, candidate, dataset, stack)
    (tmp_path / "stack" / "reporter.py").write_text("# changed reporter\n")
    second = make_context(tmp_path, candidate, dataset, stack)
    assert first["digest"] == second["digest"]
    assert first["full_digest"] != second["full_digest"]


def test_context_preview_finds_comparable_baseline(tmp_path: Path):
    baseline = make_candidate(tmp_path, version="1.0.0")
    candidate = make_candidate(tmp_path, version="2.0.0", content="v2")
    dataset = make_dataset(tmp_path)
    stack = make_stack(tmp_path)
    jobs = tmp_path / "jobs"
    job = jobs / "baseline"
    job.mkdir(parents=True)
    (job / "evaluation-context.json").write_text(json.dumps(make_context(tmp_path, baseline, dataset, stack)))
    preview = context_preview(project_root=tmp_path, candidate=load_manifest(candidate), dataset_dir=dataset, stack_path=stack, jobs_dir=jobs, mode="promotion-eligible", candidate_model_binding=MODEL_BINDING)
    assert preview["fresh_baseline_required"] is False
    assert preview["comparable_baselines"][0]["job"] == "baseline"


def test_model_binding_change_requires_a_fresh_baseline(tmp_path: Path):
    candidate = make_candidate(tmp_path)
    dataset = make_dataset(tmp_path)
    stack = make_stack(tmp_path)
    first = make_context(tmp_path, candidate, dataset, stack)
    from harbor_dsh_evolution.context import build_evaluation_context

    changed = build_evaluation_context(
        dataset,
        candidate=load_manifest(candidate),
        stack_path=stack,
        project_root=tmp_path,
        mode="promotion-eligible",
        candidate_model_binding={**MODEL_BINDING, "model": "gpt-other"},
    )
    assert first["candidate_model_binding"]["model"] == "gpt-test"
    assert first["digest"] != changed["digest"]
