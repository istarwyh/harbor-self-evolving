from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from harbor_dsh_evolution.identity import canonical_digest
from harbor_dsh_evolution.summary import load_or_create_summary


def _is_number(value: Any) -> bool:
    return isinstance(value, int | float) and not isinstance(value, bool)


def load_policy(path: Path) -> dict[str, Any]:
    policy = json.loads(path.expanduser().resolve(strict=True).read_text())
    if policy.get("schema_version") != 2:
        raise ValueError("Promotion Policy must use schema_version 2")
    for key in ("policy_id", "version", "primary_metric", "primary_direction"):
        if not isinstance(policy.get(key), str) or not policy[key].strip():
            raise ValueError(f"Promotion Policy requires non-empty {key}")
    return policy


def evaluate_promotion(
    baseline: dict[str, Any],
    candidate: dict[str, Any],
    policy: dict[str, Any],
) -> dict[str, Any]:
    reasons: list[dict[str, str]] = []

    def reject(code: str, message: str) -> None:
        if not any(item["code"] == code for item in reasons):
            reasons.append({"code": code, "message": message})

    baseline_candidate = baseline.get("candidate") or {}
    candidate_identity = candidate.get("candidate") or {}
    if baseline_candidate.get("candidate_id") != candidate_identity.get("candidate_id"):
        reject("CANDIDATE_PRODUCT_MISMATCH", "Baseline and Candidate are different Agent product lines")
    if not baseline_candidate.get("digest") or not candidate_identity.get("digest"):
        reject("CANDIDATE_IDENTITY_MISSING", "Candidate identity is missing")
    elif baseline_candidate["digest"] == candidate_identity["digest"]:
        reject("CANDIDATE_DIGEST_UNCHANGED", "Candidate digest is unchanged")

    base_context = baseline.get("evaluation_context") or {}
    next_context = candidate.get("evaluation_context") or {}
    if base_context.get("schema_version") != 2 or next_context.get("schema_version") != 2:
        reject("EVALUATION_CONTEXT_SCHEMA_INVALID", "Both Jobs require Evaluation Context v2")
    if base_context.get("mode") != "promotion-eligible" or next_context.get("mode") != "promotion-eligible":
        reject("JOB_MODE_NOT_PROMOTION_ELIGIBLE", "Both Jobs must be promotion-eligible")
    base_dataset = base_context.get("dataset") or {}
    next_dataset = next_context.get("dataset") or {}
    if base_dataset.get("dataset_id") != next_dataset.get("dataset_id") or base_dataset.get("version") != next_dataset.get("version"):
        reject("DATASET_VERSION_MISMATCH", "Dataset id or version changed")
    if base_dataset.get("source_digest") != next_dataset.get("source_digest"):
        reject("DATASET_SOURCE_MISMATCH", "Dataset source digest changed")
    base_stack = base_context.get("evaluation_stack") or {}
    next_stack = next_context.get("evaluation_stack") or {}
    base_components = base_stack.get("components") or {}
    next_components = next_stack.get("components") or {}
    role_codes = {
        "integration": "INTEGRATION_MISMATCH",
        "renderer": "RENDERER_MISMATCH",
        "evaluator": "EVALUATOR_MISMATCH",
        "rubric": "RUBRIC_MISMATCH",
        "runner": "RUNNER_SEMANTICS_MISMATCH",
    }
    for role, code in role_codes.items():
        old = base_components.get(role) or {}
        new = next_components.get(role) or {}
        if old.get("reward_affecting") or new.get("reward_affecting"):
            if old.get("digest") != new.get("digest") or old.get("version") != new.get("version"):
                reject(code, f"Reward-affecting {role} identity changed")
    if base_stack.get("judge") != next_stack.get("judge"):
        reject("JUDGE_MODEL_MISMATCH", "Judge provider, model, version, or parameters changed")
    if not base_context.get("digest") or base_context.get("digest") != next_context.get("digest"):
        reject("EVALUATION_STACK_MISMATCH", "Evaluation contexts are not comparable")

    for label, summary in (("Baseline", baseline), ("Candidate", candidate)):
        if summary.get("n_infrastructure_exceptions", summary.get("n_exceptions", 0)):
            reject("INFRASTRUCTURE_EXCEPTION_PRESENT", f"{label} contains infrastructure exceptions")
        validation = summary.get("artifact_validation") or {}
        if not validation.get("valid", False) or not summary.get("_identity_artifacts_valid", False):
            reject("ARTIFACT_SCHEMA_INVALID", f"{label} contains schema-invalid artifacts")
        doctor = summary.get("_architecture_doctor") or {}
        if not doctor.get("promotion_ready", False):
            reject("ARCHITECTURE_DOCTOR_FAILED", f"{label} did not pass Architecture Doctor")

    baseline_metrics = baseline.get("metrics") or {}
    candidate_metrics = candidate.get("metrics") or {}
    primary = policy["primary_metric"]
    old_primary = baseline_metrics.get(primary)
    new_primary = candidate_metrics.get(primary)
    if not _is_number(old_primary) or not _is_number(new_primary):
        reject("PRIMARY_METRIC_MISSING", f"Primary metric {primary!r} is missing")
    else:
        direction = policy["primary_direction"]
        improvement = new_primary - old_primary if direction == "maximize" else old_primary - new_primary
        if direction not in {"maximize", "minimize"}:
            reject("PRIMARY_METRIC_DIRECTION_INVALID", "primary_direction must be maximize or minimize")
        elif improvement < float(policy.get("min_improvement", 0)):
            reject("PRIMARY_METRIC_BELOW_DELTA", f"{primary} improvement is below the required delta")

    for metric, minimum in (policy.get("minimums") or {}).items():
        value = candidate_metrics.get(metric)
        if not _is_number(value) or value < float(minimum):
            reject("METRIC_MINIMUM_FAILED", f"{metric} is below minimum {minimum}")
    for metric, maximum in (policy.get("maximums") or {}).items():
        value = candidate_metrics.get(metric)
        if not _is_number(value) or value > float(maximum):
            reject("METRIC_MAXIMUM_FAILED", f"{metric} is above maximum {maximum}")
    tolerance = float(policy.get("non_regression_tolerance", 0))
    for metric in policy.get("non_regression") or []:
        old = baseline_metrics.get(metric)
        new = candidate_metrics.get(metric)
        if not _is_number(old) or not _is_number(new):
            reject("NON_REGRESSION_METRIC_MISSING", f"Non-regression metric {metric!r} is missing")
        else:
            direction = (policy.get("metric_directions") or {}).get(metric, "maximize")
            regressed = new + tolerance < old if direction == "maximize" else new - tolerance > old
            if regressed:
                reject("NON_REGRESSION_FAILED", f"{metric} regressed from {old:.6g} to {new:.6g}")

    return {
        "schema_version": 2,
        "decision": "PROMOTE" if not reasons else "REJECT",
        "baseline_job": baseline.get("job"),
        "candidate_job": candidate.get("job"),
        "baseline_candidate": baseline_candidate,
        "candidate": candidate_identity,
        "baseline_evaluation_context": base_context,
        "candidate_evaluation_context": next_context,
        "policy": {"policy_id": policy["policy_id"], "version": policy["version"]},
        "policy_digest": canonical_digest(policy, namespace="harbor-dsh-promotion-policy-v2"),
        "baseline_metrics": baseline_metrics,
        "candidate_metrics": candidate_metrics,
        "reasons": reasons,
    }


def _gate_summary(job_dir: Path) -> dict[str, Any]:
    job_dir = job_dir.expanduser().resolve(strict=True)
    summary = load_or_create_summary(job_dir)
    required = (
        "candidate-manifest.json",
        "dataset-manifest.json",
        "evaluation-stack-manifest.json",
        "evaluation-context.json",
        "architecture-doctor.json",
        "evaluation-contract.json",
        "population-report.json",
    )
    summary["_identity_artifacts_valid"] = all((job_dir / name).is_file() for name in required)
    doctor_path = job_dir / "architecture-doctor.json"
    try:
        summary["_architecture_doctor"] = json.loads(doctor_path.read_text())
    except (OSError, json.JSONDecodeError):
        summary["_architecture_doctor"] = None
    return summary


def compare_jobs(baseline_job: Path, candidate_job: Path, policy_path: Path) -> dict[str, Any]:
    return evaluate_promotion(
        _gate_summary(baseline_job),
        _gate_summary(candidate_job),
        load_policy(policy_path),
    )


def write_report(report: dict[str, Any], output: Path) -> Path:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    return output
