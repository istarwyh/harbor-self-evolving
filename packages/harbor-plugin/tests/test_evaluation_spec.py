from __future__ import annotations

import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator

from harbor_dsh_evolution.evaluation_spec import build_evaluation_spec


def _stack() -> dict:
    return {
        "stack_id": "business-quality",
        "version": "2.0.0",
        "components": {
            "evaluator": {
                "id": "business-evaluator",
                "version": "2.0.0",
                "interface": {
                    "portable_digest": "sha256:" + "a" * 64,
                    "metric_template": {"id": "business-quality", "version": "1.0.0"},
                },
            },
            "optimizer": {"id": "evidence-first-optimizer", "version": "1.0.0"},
        },
        "judge": {"provider": "test", "model": "judge", "version": "1"},
        "evaluation_contract": {
            "primary_metric": "quality",
            "metrics": [{"id": "quality", "direction": "maximize"}],
        },
    }


def _context(candidate_digest: str = "sha256:" + "b" * 64) -> dict:
    return {
        "schema_version": 3,
        "protocol": "candidate-evaluation-context/v3",
        "job_kind": "candidate-evaluation",
        "mode": "diagnostic",
        "artifact_profile": "experiment",
        "dataset": {"dataset_id": "fixed-set", "version": "1.0.0", "source_digest": "sha256:" + "c" * 64},
        "candidate": {"candidate_id": "agent", "version": "2.0.0", "digest": candidate_digest},
    }


def test_evaluation_spec_has_stable_measurement_identity_and_valid_schema():
    baseline = build_evaluation_spec(context=_context(), stack=_stack(), repeats=3, seed_policy="fixed", seed=42)
    candidate = build_evaluation_spec(
        context=_context("sha256:" + "d" * 64), stack=_stack(), repeats=3, seed_policy="fixed", seed=42
    )
    assert baseline["protocol"] == "evaluation-spec/v1"
    assert baseline["measurement_digest"] == candidate["measurement_digest"]
    assert baseline["digest"] != candidate["digest"]
    assert baseline["evaluator"]["metric_template"] == "business-quality@1.0.0"
    schema = json.loads((Path(__file__).parents[3] / "schemas" / "evaluation-spec.schema.json").read_text())
    Draft202012Validator(schema).validate(baseline)

    changed_evaluator = _stack()
    changed_evaluator["components"]["evaluator"]["interface"]["portable_digest"] = "sha256:" + "e" * 64
    assert build_evaluation_spec(context=_context(), stack=changed_evaluator, repeats=3, seed_policy="fixed", seed=42)["measurement_digest"] != baseline["measurement_digest"]
    assert build_evaluation_spec(context=_context(), stack=_stack(), repeats=2, seed_policy="fixed", seed=42)["measurement_digest"] != baseline["measurement_digest"]


def test_evaluation_spec_rejects_ambiguous_repeat_and_seed_policy():
    with pytest.raises(ValueError, match="1 through 10"):
        build_evaluation_spec(context=_context(), stack=_stack(), repeats=11)
    with pytest.raises(ValueError, match="requires a seed"):
        build_evaluation_spec(context=_context(), stack=_stack(), seed_policy="fixed")
