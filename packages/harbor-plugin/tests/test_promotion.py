from copy import deepcopy

from harbor_dsh_evolution.promotion import evaluate_promotion


POLICY = {
    "schema_version": 2,
    "policy_id": "vertical-search",
    "version": "1.0.0",
    "primary_metric": "reward",
    "primary_direction": "maximize",
    "min_improvement": 0.1,
    "minimums": {"citation_accuracy": 0.8},
    "maximums": {"latency": 3.0},
    "non_regression": ["search_validity"],
    "metric_directions": {"search_validity": "maximize"},
}


def context():
    component = lambda role: {"id": role, "version": "1", "digest": f"sha256:{role}", "reward_affecting": role != "runner"}
    return {
        "schema_version": 2,
        "digest": "sha256:context",
        "mode": "promotion-eligible",
        "dataset": {"dataset_id": "search", "version": "1", "source_digest": "sha256:dataset"},
        "evaluation_stack": {
            "components": {role: component(role) for role in ("integration", "renderer", "evaluator", "rubric", "runner")},
            "judge": {"provider": "local", "model": "judge", "version": "1"},
        },
    }


def summary(job: str, **metrics):
    return {
        "schema_version": 3,
        "job": job,
        "candidate": {"candidate_id": "business-agent", "digest": f"sha256:{job}"},
        "evaluation_context": context(),
        "n_infrastructure_exceptions": 0,
        "n_trials": 1,
        "n_discovered_trials": 1,
        "n_valid_scores": 1,
        "n_invalid_scores": 0,
        "artifact_validation": {"valid": True},
        "_identity_artifacts_valid": True,
        "_architecture_doctor": {"promotion_ready": True},
        "metrics": metrics,
    }


def codes(report):
    return {item["code"] for item in report["reasons"]}


def test_promotes_only_improved_comparable_candidate():
    report = evaluate_promotion(
        summary("v1", reward=0.4, citation_accuracy=0.8, latency=2, search_validity=1),
        summary("v2", reward=0.8, citation_accuracy=0.9, latency=2.5, search_validity=1),
        POLICY,
    )
    assert report["decision"] == "PROMOTE"


def test_rejects_rubric_and_judge_mismatch_with_codes():
    baseline = summary("v1", reward=0.4, citation_accuracy=0.8, latency=2, search_validity=1)
    candidate = summary("v2", reward=0.8, citation_accuracy=0.9, latency=2, search_validity=1)
    candidate["evaluation_context"] = deepcopy(candidate["evaluation_context"])
    candidate["evaluation_context"]["evaluation_stack"]["components"]["rubric"]["digest"] = "sha256:changed"
    candidate["evaluation_context"]["evaluation_stack"]["judge"]["version"] = "2"
    report = evaluate_promotion(baseline, candidate, POLICY)
    assert {"RUBRIC_MISMATCH", "JUDGE_MODEL_MISMATCH"}.issubset(codes(report))


def test_rejects_context_v1_infrastructure_errors_and_invalid_artifacts():
    baseline = summary("v1", reward=0.4, citation_accuracy=0.8, latency=2, search_validity=1)
    candidate = summary("v2", reward=0.8, citation_accuracy=0.9, latency=2, search_validity=1)
    baseline["evaluation_context"] = {"schema_version": 1, "digest": "old"}
    candidate["n_infrastructure_exceptions"] = 1
    candidate["artifact_validation"] = {"valid": False}
    report = evaluate_promotion(baseline, candidate, POLICY)
    assert {"EVALUATION_CONTEXT_SCHEMA_INVALID", "INFRASTRUCTURE_EXCEPTION_PRESENT", "ARTIFACT_SCHEMA_INVALID"}.issubset(codes(report))


def test_supports_minimize_primary_metrics():
    policy = {**POLICY, "primary_metric": "latency", "primary_direction": "minimize", "min_improvement": 0.5, "minimums": {}, "maximums": {}, "non_regression": []}
    report = evaluate_promotion(summary("v1", latency=3), summary("v2", latency=2), policy)
    assert report["decision"] == "PROMOTE"


def test_rejects_invalid_or_incomplete_score_coverage():
    baseline = summary("v1", reward=0.4)
    candidate = summary("v2", reward=0.8)
    candidate["n_invalid_scores"] = 1
    candidate["n_valid_scores"] = 0
    candidate["n_discovered_trials"] = 0
    report = evaluate_promotion(baseline, candidate, POLICY)
    assert {
        "INVALID_QUALITY_SCORE_PRESENT",
        "NO_VALID_QUALITY_SCORE",
        "TRIAL_COVERAGE_INCOMPLETE",
    }.issubset(codes(report))


def test_rejects_diagnostic_only_policy_even_when_scores_improve():
    policy = {**POLICY, "diagnostic_only": True}
    report = evaluate_promotion(
        summary("v1", reward=0.4, citation_accuracy=0.8, latency=2, search_validity=1),
        summary("v2", reward=0.8, citation_accuracy=0.9, latency=2.5, search_validity=1),
        policy,
    )
    assert report["decision"] == "REJECT"
    assert "DIAGNOSTIC_ONLY_POLICY" in codes(report)


def test_historical_generation_evaluation_is_hard_rejected_from_promotion():
    baseline = summary("v1", reward=0.4)
    candidate = summary("historical", reward=1)
    candidate["job_kind"] = "historical-generation-evaluation"
    candidate["evaluation_context"] = {
        "schema_version": 1,
        "protocol": "historical-generation-evaluation-context/v1",
    }
    report = evaluate_promotion(baseline, candidate, POLICY)
    assert report["decision"] == "REJECT"
    assert report["comparable"] is False
    assert report["gate_eligible"] is False
    assert codes(report) == {"UNSUPPORTED_JOB_KIND_FOR_PROMOTION"}
