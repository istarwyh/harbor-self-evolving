import json
from pathlib import Path

import pytest

from harbor_dsh_evolution.meta_evaluation import (
    initialize_ground_truth,
    meta_evaluate,
    validate_ground_truth,
)


def ground_truth() -> dict:
    return {
        "schema_version": 1,
        "protocol": "ground-truth/v1",
        "ground_truth_id": "research-evaluator-gt",
        "version": "1.0.0",
        "source": {
            "kind": "programmatic",
            "description": "Deterministic labels derived from accepted task requirements.",
            "provenance": "versioned fixture generator 1.0.0",
            "independent_of_candidate": True,
        },
        "criteria": [
            {"id": "quality", "label": "Quality"},
            {"id": "citation", "label": "Citation"},
        ],
        "cases": [
            {
                "id": "good",
                "artifact_ref": "fixtures/good.json",
                "badcase": False,
                "criteria": [
                    {"id": "quality", "score": 1, "weight": 1, "reason": "Complete."},
                    {"id": "citation", "score": 1, "weight": 3, "reason": "Grounded."},
                ],
            },
            {
                "id": "bad-citation",
                "artifact_ref": "fixtures/bad-citation.json",
                "badcase": True,
                "criteria": [
                    {"id": "quality", "score": 0.5, "weight": 1, "reason": "Partial."},
                    {"id": "citation", "score": 0, "weight": 3, "reason": "Fabricated."},
                ],
            },
        ],
    }


def observations() -> dict:
    values = []
    expected = {"good": {"quality": 1, "citation": 1}, "bad-citation": {"quality": 0.5, "citation": 0}}
    for case_id, scores in expected.items():
        for repeat in (1, 2, 3):
            values.append({
                "case_id": case_id,
                "repeat": repeat,
                "criteria": [{"id": identity, "score": score} for identity, score in scores.items()],
            })
    return {
        "schema_version": 1,
        "protocol": "evaluator-observations/v1",
        "evaluator": {"id": "research-evaluator", "version": "2.0.0"},
        "repeat_policy": {"repeats": 3, "seed_policy": "fixed"},
        "observations": values,
    }


def test_meta_evaluation_reports_esf_sce_rcr_and_badcase_coverage():
    report = meta_evaluate(ground_truth(), observations())
    assert report["metrics"]["esf"] == 1
    assert report["metrics"]["sce"] == 0
    assert report["metrics"]["rcr"] == 1
    assert report["ground_truth"]["source"]["kind"] == "programmatic"
    assert report["ground_truth"]["badcase_count"] == 1
    assert report["coverage"]["rate"] == 1


def test_ground_truth_source_can_be_non_human_but_must_be_independent():
    value = ground_truth()
    assert validate_ground_truth(value)["ready"] is True
    value["source"]["independent_of_candidate"] = False
    with pytest.raises(ValueError, match="independent"):
        validate_ground_truth(value)


def test_ground_truth_initializer_creates_an_explicit_incomplete_draft(tmp_path: Path):
    result = initialize_ground_truth(
        project_root=tmp_path,
        output_path=Path(".harbor/ground-truth.json"),
        ground_truth_id="research-gt",
        version="1.0.0",
        source_kind="model",
        source_description="A separately pinned adjudicator model.",
        provenance="provider/model/template digest",
        criteria=["quality", "citation"],
    )
    assert result["ready"] is False
    created = json.loads((tmp_path / ".harbor/ground-truth.json").read_text())
    assert created["source"]["kind"] == "model"
    with pytest.raises(ValueError, match="already exists"):
        initialize_ground_truth(
            project_root=tmp_path,
            output_path=Path(".harbor/ground-truth.json"),
            ground_truth_id="research-gt",
            version="1.0.1",
            source_kind="model",
            source_description="Other",
            provenance="Other",
            criteria=["quality"],
        )
