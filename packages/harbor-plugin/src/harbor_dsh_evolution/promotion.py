from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from harbor_dsh_evolution.summary import load_or_create_summary


def _is_number(value: Any) -> bool:
    return isinstance(value, int | float) and not isinstance(value, bool)


def load_policy(path: Path) -> dict[str, Any]:
    policy = json.loads(path.expanduser().resolve(strict=True).read_text())
    if int(policy.get("schema_version", 0)) != 1:
        raise ValueError("Promotion policy must use schema_version 1")
    if not isinstance(policy.get("primary_metric"), str):
        raise ValueError("Promotion policy requires primary_metric")
    return policy


def evaluate_promotion(
    baseline: dict[str, Any],
    candidate: dict[str, Any],
    policy: dict[str, Any],
) -> dict[str, Any]:
    baseline_metrics = baseline.get("metrics") or {}
    candidate_metrics = candidate.get("metrics") or {}
    reasons: list[str] = []

    baseline_candidate = baseline.get("candidate") or {}
    candidate_identity = candidate.get("candidate") or {}
    baseline_candidate_id = baseline_candidate.get("candidate_id")
    candidate_id = candidate_identity.get("candidate_id")
    baseline_candidate_digest = baseline_candidate.get("digest")
    candidate_digest = candidate_identity.get("digest")
    if not baseline_candidate_id or not candidate_id:
        reasons.append("candidate identity is missing")
    elif baseline_candidate_id != candidate_id:
        reasons.append(
            "candidate product line mismatch: "
            f"baseline={baseline_candidate_id}, candidate={candidate_id}"
        )
    if not baseline_candidate_digest or not candidate_digest:
        reasons.append("candidate digest is missing")
    elif baseline_candidate_digest == candidate_digest:
        reasons.append("candidate digest is unchanged")

    baseline_context = baseline.get("evaluation_context") or {}
    candidate_context = candidate.get("evaluation_context") or {}
    baseline_context_digest = baseline_context.get("digest")
    candidate_context_digest = candidate_context.get("digest")
    if not baseline_context_digest or not candidate_context_digest:
        reasons.append("evaluation context digest is missing")
    elif baseline_context_digest != candidate_context_digest:
        reasons.append(
            "evaluation context mismatch: "
            f"baseline={baseline_context_digest}, candidate={candidate_context_digest}"
        )

    if baseline.get("n_exceptions", 0):
        reasons.append("baseline contains exceptions")
    if candidate.get("n_exceptions", 0):
        reasons.append("candidate contains exceptions")

    primary = policy["primary_metric"]
    baseline_primary = baseline_metrics.get(primary)
    candidate_primary = candidate_metrics.get(primary)
    if not _is_number(baseline_primary) or not _is_number(candidate_primary):
        reasons.append(f"primary metric {primary!r} is missing")
    else:
        improvement = candidate_primary - baseline_primary
        required = float(policy.get("min_improvement", 0.0))
        if improvement < required:
            reasons.append(
                f"{primary} improvement {improvement:.6g} is below {required:.6g}"
            )

    for metric, minimum in (policy.get("minimums") or {}).items():
        value = candidate_metrics.get(metric)
        if not _is_number(value) or value < float(minimum):
            reasons.append(f"{metric}={value!r} is below minimum {minimum}")

    tolerance = float(policy.get("non_regression_tolerance", 0.0))
    for metric in policy.get("non_regression") or []:
        old = baseline_metrics.get(metric)
        new = candidate_metrics.get(metric)
        if not _is_number(old) or not _is_number(new):
            reasons.append(f"non-regression metric {metric!r} is missing")
        elif new + tolerance < old:
            reasons.append(f"{metric} regressed from {old:.6g} to {new:.6g}")

    policy_digest = "sha256:" + hashlib.sha256(
        json.dumps(policy, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    return {
        "schema_version": 1,
        "decision": "PROMOTE" if not reasons else "REJECT",
        "baseline_job": baseline.get("job"),
        "candidate_job": candidate.get("job"),
        "baseline_candidate": baseline_candidate,
        "candidate": candidate_identity,
        "baseline_evaluation_context": baseline_context,
        "candidate_evaluation_context": candidate_context,
        "policy": policy,
        "policy_digest": policy_digest,
        "baseline_metrics": baseline_metrics,
        "candidate_metrics": candidate_metrics,
        "reasons": reasons,
    }


def compare_jobs(
    baseline_job: Path,
    candidate_job: Path,
    policy_path: Path,
) -> dict[str, Any]:
    return evaluate_promotion(
        load_or_create_summary(baseline_job),
        load_or_create_summary(candidate_job),
        load_policy(policy_path),
    )


def write_report(report: dict[str, Any], output: Path) -> Path:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    return output
