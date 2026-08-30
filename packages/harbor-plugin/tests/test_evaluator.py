import json
from pathlib import Path

import pytest
import yaml

from harbor_dsh_evolution.evaluator import (
    inspect_evaluator,
    load_evaluator_descriptor,
    update_evaluator_source,
    validate_evaluation_result,
)

from helpers import make_stack


def make_v2_evaluator(
    root: Path,
    *,
    criteria: list[dict] | None = None,
    minimum_coverage: float = 0.5,
) -> tuple[Path, dict]:
    stack_path = make_stack(root)
    stack = yaml.safe_load(stack_path.read_text())
    descriptor_path = root / stack["components"]["evaluator"]["entry"]
    descriptor = json.loads(descriptor_path.read_text())
    descriptor["schema_version"] = 2
    descriptor["interface"] = "harbor-dsh-evaluator/v2"
    descriptor["protocol"] = {
        "input": "evaluation-input/v2",
        "output": "evaluation-result/v2",
    }
    descriptor["criteria"] = criteria or [
        {
            "id": "citation_accuracy",
            "label": "Citation accuracy",
            "values": [0, 0.5, 1],
            "required": True,
        },
        {
            "id": "factual_correctness",
            "label": "Factual correctness",
            "values": [0, 0.5, 1],
        },
    ]
    descriptor["aggregate"]["minimum_coverage"] = minimum_coverage
    descriptor_path.write_text(json.dumps(descriptor))
    return stack_path, load_evaluator_descriptor(descriptor_path, project_root=root)


def v2_criterion(
    identity: str,
    *,
    status: str,
    score: float | None,
) -> dict:
    return {
        "id": identity,
        "status": status,
        "score": score,
        "reason": f"Reason for {identity}.",
        "recommendation": f"Recommendation for {identity}.",
        "evidence_refs": [] if score is None else [f"observation.json#/{identity}"],
    }


def test_evaluator_bundle_supports_script_and_ternary_result(tmp_path: Path):
    stack_path = make_stack(tmp_path)
    inspected = inspect_evaluator(project_root=tmp_path, stack_path=stack_path)
    evaluator = inspected["evaluator"]
    assert evaluator["interface"] == "harbor-dsh-evaluator/v1"
    assert evaluator["kind"] == "script"
    assert evaluator["editable_files"][0]["text"].startswith("def evaluate")
    validated = validate_evaluation_result(
        {
            "schema_version": 1,
            "protocol": "evaluation-result/v1",
            "criteria": [{
                "id": "citation_accuracy",
                "score": 0.5,
                "reason": "One citation is incomplete.",
                "recommendation": "Cite the retrieved source for the unsupported claim.",
            }],
        },
        criteria=evaluator["criteria"],
    )
    assert validated["criteria"] == {"citation_accuracy": 0.5}
    assert validated["details"]["citation_accuracy"]["recommendation"].startswith("Cite")
    assert validated["reward"] == 0.5


@pytest.mark.parametrize("missing", ["reason", "recommendation"])
def test_evaluator_result_requires_reason_and_recommendation(tmp_path: Path, missing: str):
    stack_path = make_stack(tmp_path)
    evaluator = inspect_evaluator(project_root=tmp_path, stack_path=stack_path)["evaluator"]
    criterion = {
        "id": "citation_accuracy",
        "score": 0.5,
        "reason": "A source is missing.",
        "recommendation": "Add the missing source.",
    }
    criterion.pop(missing)
    with pytest.raises(ValueError, match=missing):
        validate_evaluation_result(
            {"schema_version": 1, "protocol": "evaluation-result/v1", "criteria": [criterion]},
            criteria=evaluator["criteria"],
        )


def test_evaluator_rejects_non_ternary_contract_and_llm_judge_without_identity(tmp_path: Path):
    stack_path = make_stack(tmp_path)
    stack = yaml.safe_load(stack_path.read_text())
    descriptor_path = tmp_path / stack["components"]["evaluator"]["entry"]
    descriptor = json.loads(descriptor_path.read_text())
    descriptor["kind"] = "llm-as-judge"
    descriptor["criteria"][0]["values"] = [0, 1]
    descriptor_path.write_text(json.dumps(descriptor))
    with pytest.raises(ValueError, match=r"\[0, 0.5, 1\]"):
        load_evaluator_descriptor(descriptor_path, project_root=tmp_path)


def test_llm_as_judge_uses_the_same_interface_when_non_secret_identity_is_declared(tmp_path: Path):
    stack_path = make_stack(tmp_path)
    stack = yaml.safe_load(stack_path.read_text())
    descriptor_path = tmp_path / stack["components"]["evaluator"]["entry"]
    descriptor = json.loads(descriptor_path.read_text())
    descriptor["kind"] = "llm-as-judge"
    descriptor["judge"] = {
        "provider": "responses-compatible",
        "model_env": "HSE_JUDGE_MODEL",
        "endpoint_env": "HSE_JUDGE_RESPONSES_URL",
        "temperature": 0,
    }
    descriptor_path.write_text(json.dumps(descriptor))
    loaded = load_evaluator_descriptor(descriptor_path, project_root=tmp_path)
    assert loaded["kind"] == "llm-as-judge"
    assert loaded["judge"]["model_env"] == "HSE_JUDGE_MODEL"


def test_v2_descriptor_declares_applicability_contract_without_changing_v1_defaults(tmp_path: Path):
    stack_path, evaluator = make_v2_evaluator(tmp_path, minimum_coverage=0.75)
    inspected = inspect_evaluator(project_root=tmp_path, stack_path=stack_path)["evaluator"]

    assert evaluator["schema_version"] == 2
    assert evaluator["interface"] == "harbor-dsh-evaluator/v2"
    assert evaluator["protocol"] == {
        "input": "evaluation-input/v2",
        "output": "evaluation-result/v2",
    }
    assert evaluator["criteria"][0]["required"] is True
    assert evaluator["criteria"][1]["required"] is False
    assert evaluator["aggregate"]["minimum_coverage"] == 0.75
    assert inspected["digest"] == evaluator["digest"]


def test_v2_result_recomputes_coverage_and_accepts_optional_abstention(tmp_path: Path):
    _, evaluator = make_v2_evaluator(tmp_path)
    validated = validate_evaluation_result(
        {
            "schema_version": 2,
            "protocol": "evaluation-result/v2",
            "criteria": [
                v2_criterion("citation_accuracy", status="scored", score=1),
                v2_criterion("factual_correctness", status="not-applicable", score=None),
            ],
            "aggregate": {
                "metric_id": "reward",
                "value": 1,
                "scored_criteria": 1,
                "total_criteria": 2,
                "coverage": 0.5,
            },
        },
        criteria=evaluator["criteria"],
        aggregate=evaluator["aggregate"],
    )

    assert validated["criteria"] == {"citation_accuracy": 1.0, "factual_correctness": None}
    assert validated["aggregate"] == {
        "metric_id": "reward",
        "value": 1.0,
        "scored_criteria": 1,
        "total_criteria": 2,
        "coverage": 0.5,
    }
    assert validated["criterion_status_counts"] == {
        "scored": 1,
        "not-applicable": 1,
        "insufficient-evidence": 0,
        "evaluation-error": 0,
    }
    assert validated["required_criteria_scored"] is True
    assert validated["coverage_satisfied"] is True
    assert validated["score_valid"] is True
    assert validated["reward"] == 1


def test_v2_result_keeps_aggregate_but_withholds_reward_when_required_criterion_is_unscored(tmp_path: Path):
    _, evaluator = make_v2_evaluator(tmp_path)
    validated = validate_evaluation_result(
        {
            "schema_version": 2,
            "protocol": "evaluation-result/v2",
            "criteria": [
                v2_criterion("citation_accuracy", status="insufficient-evidence", score=None),
                v2_criterion("factual_correctness", status="scored", score=0.5),
            ],
            "aggregate": {
                "metric_id": "reward",
                "value": 0.5,
                "scored_criteria": 1,
                "total_criteria": 2,
                "coverage": 0.5,
            },
        },
        criteria=evaluator["criteria"],
        aggregate=evaluator["aggregate"],
    )

    assert validated["aggregate"]["value"] == 0.5
    assert validated["required_criteria_scored"] is False
    assert validated["score_valid"] is False
    assert validated["reward"] is None


def test_v2_result_withholds_reward_below_coverage_threshold(tmp_path: Path):
    criteria = [
        {"id": "required", "label": "Required", "values": [0, 0.5, 1], "required": True},
        {"id": "optional-a", "label": "Optional A", "values": [0, 0.5, 1]},
        {"id": "optional-b", "label": "Optional B", "values": [0, 0.5, 1]},
    ]
    _, evaluator = make_v2_evaluator(tmp_path, criteria=criteria, minimum_coverage=0.75)
    validated = validate_evaluation_result(
        {
            "schema_version": 2,
            "protocol": "evaluation-result/v2",
            "criteria": [
                v2_criterion("required", status="scored", score=1),
                v2_criterion("optional-a", status="not-applicable", score=None),
                v2_criterion("optional-b", status="insufficient-evidence", score=None),
            ],
            "aggregate": {
                "metric_id": "reward",
                "value": 1,
                "scored_criteria": 1,
                "total_criteria": 3,
                "coverage": 0.333333,
            },
        },
        criteria=evaluator["criteria"],
        aggregate=evaluator["aggregate"],
    )

    assert validated["coverage"] == 0.333333
    assert validated["required_criteria_scored"] is True
    assert validated["coverage_satisfied"] is False
    assert validated["reward"] is None


@pytest.mark.parametrize(
    ("status", "score", "message"),
    [
        ("scored", None, "requires score 0, 0.5, or 1"),
        ("not-applicable", 0, "requires score null"),
        ("insufficient-evidence", 0.5, "requires score null"),
        ("evaluation-error", 1, "requires score null"),
        ("unknown", None, "unsupported status"),
    ],
)
def test_v2_result_enforces_status_score_pairing(
    tmp_path: Path,
    status: str,
    score: float | None,
    message: str,
):
    criteria = [{"id": "quality", "label": "Quality", "values": [0, 0.5, 1]}]
    _, evaluator = make_v2_evaluator(tmp_path, criteria=criteria, minimum_coverage=0)
    with pytest.raises(ValueError, match=message):
        validate_evaluation_result(
            {
                "schema_version": 2,
                "protocol": "evaluation-result/v2",
                "criteria": [v2_criterion("quality", status=status, score=score)],
                "aggregate": {
                    "metric_id": "reward",
                    "value": None,
                    "scored_criteria": 0,
                    "total_criteria": 1,
                    "coverage": 0,
                },
            },
            criteria=evaluator["criteria"],
            aggregate=evaluator["aggregate"],
        )


@pytest.mark.parametrize(
    ("field", "value", "message"),
    [
        ("metric_id", "other", "metric_id"),
        ("value", 0, "value"),
        ("scored_criteria", 2, "scored_criteria"),
        ("total_criteria", 3, "total_criteria"),
        ("coverage", 1, "coverage"),
    ],
)
def test_v2_result_rejects_tampered_aggregate(
    tmp_path: Path,
    field: str,
    value: object,
    message: str,
):
    _, evaluator = make_v2_evaluator(tmp_path)
    reported_aggregate = {
        "metric_id": "reward",
        "value": 1,
        "scored_criteria": 1,
        "total_criteria": 2,
        "coverage": 0.5,
    }
    reported_aggregate[field] = value
    with pytest.raises(ValueError, match=message):
        validate_evaluation_result(
            {
                "schema_version": 2,
                "protocol": "evaluation-result/v2",
                "criteria": [
                    v2_criterion("citation_accuracy", status="scored", score=1),
                    v2_criterion("factual_correctness", status="not-applicable", score=None),
                ],
                "aggregate": reported_aggregate,
            },
            criteria=evaluator["criteria"],
            aggregate=evaluator["aggregate"],
        )


@pytest.mark.parametrize("missing", ["reason", "recommendation", "evidence_refs", "score"])
def test_v2_result_requires_explanations_evidence_and_explicit_score(tmp_path: Path, missing: str):
    criteria = [{"id": "quality", "label": "Quality", "values": [0, 0.5, 1]}]
    _, evaluator = make_v2_evaluator(tmp_path, criteria=criteria, minimum_coverage=0)
    criterion = v2_criterion("quality", status="insufficient-evidence", score=None)
    criterion.pop(missing)
    with pytest.raises(ValueError, match=missing):
        validate_evaluation_result(
            {
                "schema_version": 2,
                "protocol": "evaluation-result/v2",
                "criteria": [criterion],
                "aggregate": {
                    "metric_id": "reward",
                    "value": None,
                    "scored_criteria": 0,
                    "total_criteria": 1,
                    "coverage": 0,
                },
            },
            criteria=evaluator["criteria"],
            aggregate=evaluator["aggregate"],
        )


def test_v2_evaluation_error_is_not_a_zero_quality_score(tmp_path: Path):
    criteria = [{"id": "quality", "label": "Quality", "values": [0, 0.5, 1]}]
    _, evaluator = make_v2_evaluator(tmp_path, criteria=criteria, minimum_coverage=0)
    validated = validate_evaluation_result(
        {
            "schema_version": 2,
            "protocol": "evaluation-result/v2",
            "criteria": [v2_criterion("quality", status="evaluation-error", score=None)],
            "aggregate": {
                "metric_id": "reward",
                "value": None,
                "scored_criteria": 0,
                "total_criteria": 1,
                "coverage": 0,
            },
        },
        criteria=evaluator["criteria"],
        aggregate=evaluator["aggregate"],
    )

    assert validated["criterion_status_counts"]["evaluation-error"] == 1
    assert validated["reward"] is None
    assert validated["score_valid"] is False


def test_controlled_update_requires_digest_and_creates_new_identities(tmp_path: Path):
    stack_path = make_stack(tmp_path)
    current = inspect_evaluator(project_root=tmp_path, stack_path=stack_path)
    editable = current["evaluator"]["editable_files"][0]
    with pytest.raises(ValueError, match="changed after it was opened"):
        update_evaluator_source(
            project_root=tmp_path,
            stack_path=stack_path,
            file_path=editable["path"],
            content="def evaluate(payload):\n    return {}\n",
            expected_digest="sha256:stale",
            new_evaluator_version="2.0.0",
            new_stack_version="2.0.0",
        )
    updated = update_evaluator_source(
        project_root=tmp_path,
        stack_path=stack_path,
        file_path=editable["path"],
        content="def evaluate(payload):\n    return {'updated': True}\n",
        expected_digest=editable["digest"],
        new_evaluator_version="2.0.0",
        new_stack_version="2.0.0",
    )
    assert updated["requires_fresh_baseline"] is True
    assert updated["evaluator"]["version"] == "2.0.0"
    assert (tmp_path / editable["path"]).read_text() == editable["text"]
    stack = yaml.safe_load(stack_path.read_text())
    assert stack["version"] == "2.0.0"
    assert stack["components"]["evaluator"]["version"] == "2.0.0"
    assert stack["components"]["evaluator"]["entry"] == "stack/evaluator/2.0.0/evaluator.json"
    assert (tmp_path / "stack/evaluator/2.0.0/evaluator.py").read_text() == "def evaluate(payload):\n    return {'updated': True}\n"
