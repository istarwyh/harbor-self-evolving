import json
from pathlib import Path

from harbor_dsh_evolution.dataset import snapshot_dataset, validate_dataset
from harbor_dsh_evolution.doctor import architecture_doctor
from harbor_dsh_evolution.initialize import initialize_project
from harbor_dsh_evolution.stack import snapshot_stack

from helpers import make_candidate, make_dataset, make_stack


def test_dataset_validator_detects_duplicate_task_and_source_mutation(tmp_path: Path):
    dataset = make_dataset(tmp_path)
    manifest_path = dataset / "dataset-manifest.json"
    manifest = json.loads(manifest_path.read_text())
    manifest["tasks"].append({**manifest["tasks"][0]})
    manifest["task_count"] = 2
    manifest_path.write_text(json.dumps(manifest))
    result = validate_dataset(dataset, project_root=tmp_path)
    assert result.valid is False
    assert "DATASET_TASK_ID_DUPLICATE" in {item["code"] for item in result.findings}
    snapshot_dataset(dataset, dataset_id="vertical-search", version="2")
    (dataset / "instruction.md").write_text("mutated\n")
    assert "DATASET_SOURCE_DIGEST_MISMATCH" in {item["code"] for item in validate_dataset(dataset).findings}


def test_stack_snapshot_separates_comparison_and_full_identity(tmp_path: Path):
    stack_path = make_stack(tmp_path)
    first = snapshot_stack(stack_path, project_root=tmp_path)
    (tmp_path / "stack" / "reporter.py").write_text("changed reporter\n")
    second = snapshot_stack(stack_path, project_root=tmp_path)
    assert first["digest"] != second["digest"]
    assert first["comparison_digest"] == second["comparison_digest"]


def test_doctor_blocks_god_runner_and_direct_promotion(tmp_path: Path):
    candidate = make_candidate(tmp_path)
    dataset = make_dataset(tmp_path)
    stack_path = make_stack(tmp_path)
    (tmp_path / "stack" / "runner.py").write_text("import requests\nrubric = judge = llm = promote = True\n")
    result = architecture_doctor(project_root=tmp_path, stack_path=stack_path, dataset_path=dataset, candidate_path=candidate)
    codes = {item["code"] for item in result["findings"]}
    assert result["promotion_ready"] is False
    assert {"GOD_RUNNER_HTTP_RUBRIC_JUDGE", "RUNNER_DIRECT_PROMOTION"}.issubset(codes)


def test_doctor_reports_duplicate_task_implementations_and_runner_semantics(tmp_path: Path):
    candidate = make_candidate(tmp_path)
    dataset = tmp_path / "dataset"
    for task_id in ("task-a", "task-b"):
        task = dataset / task_id
        (task / "tests").mkdir(parents=True)
        (task / "environment").mkdir()
        (task / "task.toml").write_text(f'[task]\nname="{task_id}"\nversion="1"\n')
        (task / "instruction.md").write_text(f"Evaluate {task_id}.\n")
        (task / "tests" / "judge.py").write_text("print('shared judge')\n")
        (task / "environment" / "Dockerfile").write_text("FROM alpine:3.22\n")
        (task / "rubric.json").write_text('{"criteria":["D1_1"]}\n')
    snapshot_dataset(dataset, dataset_id="duplicates", version="1.0.0")
    stack_path = make_stack(tmp_path)
    (tmp_path / "stack" / "runner.py").write_text(
        "D1_1 = 0\nreward = 0\nframe = 'sse'\noutput = 'optimization-report.json'\n"
    )
    result = architecture_doctor(
        project_root=tmp_path,
        stack_path=stack_path,
        dataset_path=dataset,
        candidate_path=candidate,
    )
    codes = {item["code"] for item in result["findings"]}
    assert {
        "DATASET_DUPLICATE_EVALUATOR",
        "DATASET_DUPLICATE_ENVIRONMENT",
        "DATASET_DUPLICATE_RUBRIC",
        "RUNNER_WRITES_OPTIMIZATION_REPORT",
        "RUNNER_BUSINESS_EVALUATION_LOGIC",
    }.issubset(codes)


def test_initializer_is_non_overwriting_and_creates_strict_project(tmp_path: Path):
    dataset = tmp_path / "dataset"
    dataset.mkdir()
    (dataset / "task.toml").write_text('[task]\nname="search"\nversion="1"\n')
    (dataset / "instruction.md").write_text("Search.\n")
    args = dict(
        project_root=tmp_path, dataset_path=dataset, stack_id="search", stack_version="1.0.0",
        dataset_id="search", dataset_version="1.0.0", contract_id="search", contract_version="1.0.0",
        primary_metric="reward", primary_direction="maximize", judge_provider="local", judge_model="judge",
        judge_version="1", policy_id="search", policy_version="1", min_improvement=0.1,
    )
    first = initialize_project(**args)
    second = initialize_project(**args)
    assert ".harbor/evaluation-stack.yml" in first["created"]
    assert ".harbor/evaluation-stack.yml" in second["preserved"]
    assert (tmp_path / "policies" / "promotion.json").is_file()
