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
