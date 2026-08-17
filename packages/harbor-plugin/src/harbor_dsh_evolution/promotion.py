from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from harbor_dsh_evolution.summary import load_or_create_summary


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

    if baseline.get("n_exceptions", 0):
        reasons.append("baseline contains exceptions")
    if candidate.get("n_exceptions", 0):
        reasons.append("candidate contains exceptions")

    primary = policy["primary_metric"]
    baseline_primary = baseline_metrics.get(primary)
    candidate_primary = candidate_metrics.get(primary)
    if not isinstance(baseline_primary, int | float) or not isinstance(
        candidate_primary, int | float
    ):
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
        if not isinstance(value, int | float) or value < float(minimum):
            reasons.append(f"{metric}={value!r} is below minimum {minimum}")

    tolerance = float(policy.get("non_regression_tolerance", 0.0))
    for metric in policy.get("non_regression") or []:
        old = baseline_metrics.get(metric)
        new = candidate_metrics.get(metric)
        if not isinstance(old, int | float) or not isinstance(new, int | float):
            reasons.append(f"non-regression metric {metric!r} is missing")
        elif new + tolerance < old:
            reasons.append(f"{metric} regressed from {old:.6g} to {new:.6g}")

    return {
        "schema_version": 1,
        "decision": "PROMOTE" if not reasons else "REJECT",
        "baseline_job": baseline.get("job"),
        "candidate_job": candidate.get("job"),
        "baseline_candidate": baseline.get("candidate"),
        "candidate": candidate.get("candidate"),
        "policy": policy,
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
