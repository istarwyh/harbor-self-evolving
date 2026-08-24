import json
from pathlib import Path

import yaml
import harbor_dsh_evolution.doctor as doctor_module

from harbor_dsh_evolution.dataset import build_dataset_preview, snapshot_dataset, validate_dataset
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
    (dataset / "search-task" / "instruction.md").write_text("mutated\n")
    assert "DATASET_SOURCE_DIGEST_MISMATCH" in {item["code"] for item in validate_dataset(dataset).findings}


def test_dataset_snapshot_exposes_user_query_and_topic_from_task_metadata(tmp_path: Path):
    dataset = make_dataset(tmp_path)
    (dataset / "search-task" / "task.toml").write_text(
        'schema_version="1.4"\n\n[task]\nname="concept/color"\nversion="1"\n\n[metadata]\nquery="什么是颜色？"\ntopic="颜色"\n'
    )
    manifest = snapshot_dataset(dataset, dataset_id="concepts", version="3.0.0")
    assert manifest["tasks"][0]["query"] == "什么是颜色？"
    preview = build_dataset_preview(dataset, manifest)
    assert preview["tasks"][0]["query"] == "什么是颜色？"
    assert preview["tasks"][0]["metadata"]["topic"] == "颜色"


def test_dataset_snapshot_rejects_task_at_dataset_root_even_when_files_are_complete(tmp_path: Path):
    dataset = tmp_path / "root-task"
    (dataset / "environment").mkdir(parents=True)
    (dataset / "tests").mkdir()
    (dataset / "task.toml").write_text(
        'schema_version="1.4"\n\n[task]\nname="examples/root-task"\nversion="1"\n'
    )
    (dataset / "instruction.md").write_text("Run me.\n")
    (dataset / "environment/Dockerfile").write_text("FROM alpine:3.22\n")
    (dataset / "tests/test.sh").write_text("#!/bin/sh\n")

    try:
        snapshot_dataset(dataset)
    except ValueError as error:
        assert "HARBOR_RUNTIME_NO_TASKS" in str(error)
        assert "immediately below" in str(error)
    else:
        raise AssertionError("Harbor -p cannot resolve a Task at the Dataset root")


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
        (task / "tests" / "test.sh").write_text("#!/bin/sh\npython3 /tests/judge.py\n")
        (task / "tests" / "judge.py").write_text("print('shared judge')\n")
        (task / "environment" / "Dockerfile").write_text("FROM alpine:3.22\n")
        (task / "rubric.json").write_text('{"criteria":["D1_1"]}\n')
        (task / "task.toml").write_text(
            f'schema_version="1.4"\n\n[task]\nname="examples/{task_id}"\nversion="1"\n'
        )
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


def test_doctor_requires_evaluator_result_artifact_when_interface_is_declared(tmp_path: Path):
    dataset = make_dataset(tmp_path)
    (dataset / "search-task/tests/test.sh").write_text(
        "#!/bin/sh\nmkdir -p /logs/verifier\nprintf '{\"reward\":1}' > /logs/verifier/reward.json\n"
    )
    snapshot_dataset(dataset, dataset_id="vertical-search", version="2.0.0")
    result = architecture_doctor(
        project_root=tmp_path,
        stack_path=make_stack(tmp_path),
        dataset_path=dataset,
    )
    assert "EVALUATOR_RESULT_OUTPUT_MISSING" in {item["code"] for item in result["findings"]}


def test_runtime_doctor_reports_missing_local_image_and_unproven_acp_dependencies(tmp_path: Path, monkeypatch):
    dataset = make_dataset(tmp_path)
    stack = make_stack(tmp_path)
    monkeypatch.setattr(doctor_module.shutil, "which", lambda name: "/usr/bin/docker" if name == "docker" else None)

    class Result:
        def __init__(self, returncode: int):
            self.returncode = returncode
            self.stdout = ""
            self.stderr = ""

    monkeypatch.setattr(
        doctor_module.subprocess,
        "run",
        lambda command, **_kwargs: Result(0 if command[1] == "version" else 1),
    )
    result = architecture_doctor(
        project_root=tmp_path,
        stack_path=stack,
        dataset_path=dataset,
        runtime_checks=True,
    )
    codes = {item["code"] for item in result["findings"]}
    assert "DOCKER_BASE_IMAGE_NOT_LOCAL" in codes
    assert "ACP_SETUP_READINESS_UNPROVEN" in codes


def test_initializer_is_non_overwriting_and_creates_strict_project(tmp_path: Path):
    dataset = make_dataset(tmp_path)
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


def test_initializer_rejects_different_stack_id_and_supports_namespaced_workspaces(tmp_path: Path):
    dataset = make_dataset(tmp_path)
    args = dict(
        project_root=tmp_path, dataset_path=dataset, stack_id="search", stack_version="1.0.0",
        dataset_id="search", dataset_version="1.0.0", contract_id="search", contract_version="1.0.0",
        primary_metric="reward", primary_direction="maximize", judge_provider="local", judge_model="judge",
        judge_version="1", policy_id="search", policy_version="1", min_improvement=0.1,
    )
    initialize_project(**args)
    try:
        initialize_project(**{**args, "stack_id": "other"})
    except ValueError as error:
        assert "STACK_ALREADY_EXISTS_DIFFERENT_ID" in str(error)
        assert "workspace-subdir" in str(error)
    else:
        raise AssertionError("different stack id should not be silently preserved")

    nested = initialize_project(**{**args, "stack_id": "other", "workspace_subdir": "harbor-projects/other"})
    assert nested["workspace"] == "harbor-projects/other"
    assert nested["stack_path"] == "harbor-projects/other/.harbor/evaluation-stack.yml"
    stack = yaml.safe_load((tmp_path / nested["stack_path"]).read_text())
    assert stack["components"]["evaluator"]["entry"].startswith("harbor-projects/other/")
