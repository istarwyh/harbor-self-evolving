from copy import deepcopy

import pytest

from harbor_dsh_evolution.metric_templates import (
    evaluator_criteria,
    load_metric_template,
    validate_metric_template,
)


def test_general_agent_session_template_declares_applicability_and_evidence():
    template = load_metric_template("general-agent-session@1")

    assert template["protocol"] == "metric-template/v1"
    assert template["aggregation"] == {
        "method": "weighted-mean",
        "minimum_required_coverage": 1.0,
    }
    assert {item["id"] for item in template["criteria"]} == {
        "goal_progress",
        "execution_reliability",
        "evidence_alignment",
        "interaction_quality",
    }
    assert all(item["applicability"]["task_kinds"] == ["dsh-session"] for item in template["criteria"])
    assert all(item["evidence_requirements"] for item in template["criteria"])
    assert all(item["status_policy"]["insufficient_evidence"] == "abstain" for item in template["criteria"])


def test_metric_template_loader_returns_independent_copy_and_rejects_unknown():
    first = load_metric_template("general-agent-session@1")
    first["criteria"][0]["label"] = "changed"
    assert load_metric_template("general-agent-session@1")["criteria"][0]["label"] == "Goal progress"
    with pytest.raises(ValueError, match="Unknown Metric Template"):
        load_metric_template("missing@1")


def test_metric_template_rejects_missing_evidence_requirements():
    template = deepcopy(load_metric_template("general-agent-session@1"))
    template["criteria"][0]["evidence_requirements"] = []
    with pytest.raises(ValueError, match="evidence requirements"):
        validate_metric_template(template)


def test_evaluator_projection_preserves_measurement_policy():
    criteria = evaluator_criteria("general-agent-session@1")
    assert criteria[0]["values"] == [0, 0.5, 1]
    assert criteria[0]["direction"] == "maximize"
    assert criteria[0]["quality_affecting"] is True
