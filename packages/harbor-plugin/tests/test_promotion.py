import json
from copy import deepcopy
from pathlib import Path

import pytest

from harbor_dsh_evolution.job_seal import seal_job_bundle
from harbor_dsh_evolution.identity import canonical_digest
from harbor_dsh_evolution.promotion import _gate_summary, evaluate_promotion, load_policy, write_report


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
    "execution_environment": {
        "strategy": "allow-unrestricted-host",
        "host_risk_accepted": True,
        "acceptance_rationale": "Controlled local baseline and Candidate use the same trusted Host.",
    },
}


def context():
    component = lambda role: {"id": role, "version": "1", "digest": f"sha256:{role}", "reward_affecting": role != "runner"}
    return {
        "schema_version": 3,
        "digest": "sha256:context",
        "mode": "promotion-eligible",
        "dataset": {"dataset_id": "search", "version": "1", "source_digest": "sha256:dataset"},
        "evaluation_stack": {
            "components": {role: component(role) for role in ("integration", "renderer", "evaluator", "rubric", "runner")},
            "judge": {"provider": "local", "model": "judge", "version": "1"},
        },
        "execution_environment": {"kind": "host", "runtime_fingerprint": "sha256:host"},
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
        "effective_evaluator": {
            "identity_match": True,
            "configured": {"id": "evaluator", "version": "1", "portable_digest": "sha256:evaluator"},
            "materialized": {"id": "evaluator", "version": "1", "portable_digest": "sha256:evaluator"},
            "executed": {"id": "evaluator", "version": "1", "portable_digest": "sha256:evaluator"},
            "execution": {"status": "succeeded", "error_type": None},
        },
        "_identity_artifacts_valid": True,
        "_architecture_doctor": {"promotion_ready": True},
        "_measurement_digest": "sha256:measurement",
        "_contract_digest": "sha256:contract",
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


def test_rejects_execution_environment_mismatch():
    baseline = summary("v1", reward=0.4, citation_accuracy=0.8, latency=2, search_validity=1)
    candidate = summary("v2", reward=0.8, citation_accuracy=0.9, latency=2, search_validity=1)
    candidate["evaluation_context"] = deepcopy(candidate["evaluation_context"])
    candidate["evaluation_context"]["execution_environment"] = {
        "kind": "docker",
        "runtime_fingerprint": "sha256:docker",
    }
    report = evaluate_promotion(baseline, candidate, POLICY)
    assert report["decision"] == "REJECT"
    assert "EXECUTION_ENVIRONMENT_MISMATCH" in codes(report)


def test_gate_rejects_measurement_contract_dataset_eligibility_and_unknown_environment():
    baseline = summary("v1", reward=0.4)
    candidate = summary("v2", reward=0.8)
    candidate["_measurement_digest"] = "sha256:other-measurement"
    candidate["_contract_digest"] = "sha256:other-contract"
    candidate["evaluation_context"] = deepcopy(candidate["evaluation_context"])
    candidate["evaluation_context"]["dataset"]["promotion_eligible"] = False
    candidate["evaluation_context"]["execution_environment"] = {"kind": "unknown"}

    report = evaluate_promotion(baseline, candidate, POLICY)

    assert {
        "EVALUATION_SPEC_MISMATCH",
        "EVALUATION_CONTRACT_MISMATCH",
        "DATASET_NOT_PROMOTION_ELIGIBLE",
        "EXECUTION_ENVIRONMENT_INVALID",
    }.issubset(codes(report))


def test_docker_required_policy_rejects_host_execution():
    policy = {**POLICY, "execution_environment": {"strategy": "docker-required", "require_image_identity": True}}
    report = evaluate_promotion(summary("v1", reward=0.4), summary("v2", reward=0.8), policy)
    assert "DOCKER_EXECUTION_REQUIRED" in codes(report)


def test_governed_docker_policy_rejects_missing_immutable_image_identity():
    policy = {
        **POLICY,
        "execution_environment": {"strategy": "docker-required", "require_image_identity": True},
    }
    baseline = summary("v1", reward=0.4)
    candidate = summary("v2", reward=0.8)
    for value in (baseline, candidate):
        value["evaluation_context"] = deepcopy(value["evaluation_context"])
        value["evaluation_context"]["execution_environment"] = {
            "kind": "docker", "runtime_fingerprint": "sha256:docker", "image_identity": None,
        }
    report = evaluate_promotion(baseline, candidate, policy)
    assert report["decision"] == "REJECT"
    assert "DOCKER_IMAGE_IDENTITY_MISSING" in codes(report)


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


def test_policy_loader_enforces_complete_types_ranges_and_known_fields(tmp_path: Path):
    policy_path = tmp_path / "policy.json"
    policy_path.write_text(json.dumps(POLICY))
    assert load_policy(policy_path) == POLICY

    invalid_cases = [
        {**POLICY, "min_improvement": -0.1},
        {**POLICY, "primary_direction": "sideways"},
        {**POLICY, "non_regression": ["quality", "quality"]},
        {**POLICY, "hard_requirements": ["unknown"]},
        {**POLICY, "unknown_field": True},
    ]
    for value in invalid_cases:
        policy_path.write_text(json.dumps(value))
        with pytest.raises(ValueError, match="Promotion Policy"):
            load_policy(policy_path)


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


def test_gate_recomputes_sealed_summary_invariants_instead_of_trusting_stored_values(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    job = tmp_path / "jobs" / "candidate"
    job.mkdir(parents=True)
    stored = {
        "schema_version": 3,
        "job": "candidate",
        "n_trials": 1,
        "n_discovered_trials": 1,
        "n_valid_scores": 1,
        "n_invalid_scores": 0,
        "n_infrastructure_exceptions": 0,
        "n_evaluation_exceptions": 0,
        "status_counts": {"completed": 1},
        "metrics": {"reward": 1},
        "trials": [{"id": "trial-1", "score": {"value": 1, "valid": True}}],
        "effective_evaluator": {"execution": {"status": "succeeded"}},
        "coverage": {"scored_trials": 1, "total_trials": 1},
    }
    for name, value in {
        "evaluation-summary.json": stored,
        "evaluation-context.json": {"schema_version": 3},
        "evaluation-stack-manifest.json": {"schema_version": 1},
        "dataset-manifest.json": {"schema_version": 1},
        "evaluation-spec.json": {"schema_version": 1, "measurement_digest": "sha256:measurement"},
        "evaluation-contract.json": {"schema_version": 1, "primary_metric": "reward"},
    }.items():
        (job / name).write_text(json.dumps(value) + "\n")
    seal_job_bundle(job)
    recomputed = deepcopy(stored)
    recomputed["metrics"] = {"reward": 0}
    monkeypatch.setattr("harbor_dsh_evolution.promotion.summarize_job", lambda _job: recomputed)

    loaded = _gate_summary(job)
    assert loaded["_job_bundle_error"] == "JOB_SUMMARY_INVARIANT_MISMATCH"


def test_gate_detects_population_report_tampering_after_seal(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    job = tmp_path / "jobs" / "candidate"
    job.mkdir(parents=True)
    stored = {
        "schema_version": 3, "job": "candidate", "n_trials": 1, "n_discovered_trials": 1,
        "n_valid_scores": 1, "n_invalid_scores": 0, "n_infrastructure_exceptions": 0,
        "n_evaluation_exceptions": 0, "status_counts": {"completed": 1}, "metrics": {"reward": 1},
        "trials": [{"id": "trial-1", "score": {"value": 1, "valid": True}}],
        "effective_evaluator": {"execution": {"status": "succeeded"}}, "coverage": {"scored_trials": 1, "total_trials": 1},
    }
    for name, value in {
        "evaluation-summary.json": stored,
        "evaluation-context.json": {"schema_version": 3},
        "evaluation-stack-manifest.json": {"schema_version": 1},
        "dataset-manifest.json": {"schema_version": 1},
        "evaluation-spec.json": {"schema_version": 1, "measurement_digest": "sha256:measurement"},
        "evaluation-contract.json": {"schema_version": 1, "primary_metric": "reward"},
        "population-report.json": {"schema_version": 3, "population_size": 1},
    }.items():
        (job / name).write_text(json.dumps(value) + "\n")
    seal_job_bundle(job)
    (job / "population-report.json").write_text(json.dumps({"schema_version": 3, "population_size": 999}) + "\n")
    monkeypatch.setattr("harbor_dsh_evolution.promotion.summarize_job", lambda _job: stored)

    loaded = _gate_summary(job)

    assert "JOB_BUNDLE_ARTIFACT_TAMPERED" in loaded["_job_bundle_error"]


def test_promotion_report_is_self_digested_policy_snapshotted_and_non_overwriting(tmp_path: Path):
    report = evaluate_promotion(summary("v1", reward=0.4), summary("v2", reward=0.8), POLICY)
    output = tmp_path / "promotion-report.json"

    write_report(report, output)
    saved = json.loads(output.read_text())

    assert saved["policy_snapshot"] == POLICY
    digest = saved.pop("report_digest")
    assert digest == canonical_digest(saved, namespace="harbor-dsh-promotion-report-v2")
    with pytest.raises(FileExistsError, match="immutable"):
        write_report(report, output)
