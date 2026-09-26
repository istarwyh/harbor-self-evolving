from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

from harbor_dsh_evolution.candidate_materialization import materialize_candidate_dataset
from harbor_dsh_evolution.dataset import validate_dataset
from helpers import make_dataset, make_stack


def _run_verifier(tests_dir: Path, logs_dir: Path) -> tuple[dict, dict]:
    verifier_dir = logs_dir / "verifier"
    environment = {
        **os.environ,
        "HARBOR_TESTS_DIR": str(tests_dir),
        "HSE_VERIFIER_LOG_DIR": str(verifier_dir),
        "HSE_TASK_ROOT": str(tests_dir.parent),
        "HARBOR_AGENT_LOG_DIR": str(logs_dir / "agent"),
        "HARBOR_ARTIFACTS_DIR": str(logs_dir / "artifacts"),
    }
    subprocess.run(
        [sys.executable, str(tests_dir / "verify.py")],
        env=environment,
        check=True,
        capture_output=True,
        text=True,
    )
    return (
        json.loads((verifier_dir / "evaluation-result.json").read_text()),
        json.loads((verifier_dir / "reward.json").read_text()),
    )


def test_candidate_materialization_replaces_task_verifiers_with_one_attested_evaluator(tmp_path: Path):
    dataset = make_dataset(tmp_path)
    stack = make_stack(tmp_path)
    output = tmp_path / ".harbor" / "private" / "candidate-materializations" / "job-a"

    receipt = materialize_candidate_dataset(
        project_root=tmp_path,
        dataset_path=dataset,
        stack_path=stack,
        output_path=output,
    )

    assert receipt["protocol"] == "candidate-evaluation-materialization/v1"
    assert validate_dataset(output, project_root=tmp_path).valid is True
    tests_dir = output / "search-task" / "tests"
    assert "candidate_output" not in (tests_dir / "test.sh").read_text()
    assert (tests_dir / "evaluator-bundle" / "evaluator.py").is_file()
    result, reward = _run_verifier(tests_dir, tmp_path / "logs-a")
    assert result["effective_evaluator"]["identity_match"] is True
    assert result["effective_evaluator"]["executed"]["portable_digest"] == receipt["effective_evaluator"]["configured"]["portable_digest"]
    assert reward == {"criterion_coverage": 1.0}


def test_candidate_verifier_refuses_a_tampered_materialized_bundle(tmp_path: Path):
    dataset = make_dataset(tmp_path)
    stack = make_stack(tmp_path)
    output = tmp_path / ".harbor" / "private" / "candidate-materializations" / "job-b"
    materialize_candidate_dataset(
        project_root=tmp_path,
        dataset_path=dataset,
        stack_path=stack,
        output_path=output,
    )
    tests_dir = output / "search-task" / "tests"
    with (tests_dir / "evaluator-bundle" / "evaluator.py").open("a") as stream:
        stream.write("\n# tampered\n")

    result, reward = _run_verifier(tests_dir, tmp_path / "logs-b")

    assert result["effective_evaluator"]["identity_match"] is False
    assert result["criteria"][0]["reason"].startswith("The materialized Evaluator bundle")
    assert reward == {"evaluator_identity_match": 0}


def test_candidate_verifier_never_turns_evaluator_runtime_failure_into_business_zero(tmp_path: Path):
    dataset = make_dataset(tmp_path)
    stack = make_stack(tmp_path)
    evaluator = tmp_path / "stack" / "evaluator" / "evaluator.py"
    evaluator.write_text(
        "def build_input(context):\n    return {'schema_version': 1, 'protocol': 'evaluation-input/v1'}\n\n"
        "def evaluate(payload):\n    raise RuntimeError('judge unavailable')\n"
    )
    output = tmp_path / ".harbor" / "private" / "candidate-materializations" / "job-c"
    materialize_candidate_dataset(
        project_root=tmp_path,
        dataset_path=dataset,
        stack_path=stack,
        output_path=output,
    )

    result, reward = _run_verifier(output / "search-task" / "tests", tmp_path / "logs-c")

    assert result["effective_evaluator"]["identity_match"] is True
    assert result["effective_evaluator"]["execution"]["status"] == "failed"
    assert result["criteria"][0]["reason"].startswith("Strict Evaluator execution failed")
    assert reward == {"criterion_coverage": 0.0}
