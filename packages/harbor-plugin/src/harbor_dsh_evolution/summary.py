from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path
from statistics import mean
from typing import Any, Iterable

from harbor_dsh_evolution.artifacts import validate_job_artifacts
from harbor_dsh_evolution.context import CONTEXT_NAME

SUMMARY_NAME = "evaluation-summary.json"


def _trial_payloads(job_dir: Path) -> list[dict[str, Any]]:
    payloads = []
    for path in sorted(job_dir.glob("*/result.json")):
        payload = json.loads(path.read_text())
        if "agent_info" in payload:
            payloads.append(payload)
    return payloads


def summarize_payloads(
    payloads: Iterable[dict[str, Any]],
    *,
    job_name: str,
    candidate: dict[str, Any] | None = None,
    evaluation_context: dict[str, Any] | None = None,
    artifact_validation: dict[str, Any] | None = None,
) -> dict[str, Any]:
    values: dict[str, list[float]] = defaultdict(list)
    exceptions: list[dict[str, str]] = []
    trials: list[dict[str, Any]] = []
    for payload in payloads:
        rewards = ((payload.get("verifier_result") or {}).get("rewards") or {})
        numeric_rewards = {
            key: float(value)
            for key, value in rewards.items()
            if isinstance(value, int | float) and not isinstance(value, bool)
        }
        for key, value in numeric_rewards.items():
            values[key].append(value)
        exception = payload.get("exception_info")
        current_exception = None
        if exception:
            current_exception = {
                "trial": str(payload.get("trial_name", "unknown")),
                "type": str(exception.get("exception_type", "unknown")),
                "message": str(exception.get("exception_message", ""))[:2000],
                "classification": "infrastructure",
            }
            exceptions.append(current_exception)
        trials.append(
            {
                "id": str(payload.get("id") or payload.get("trial_name") or "unknown"),
                "name": payload.get("trial_name"),
                "rewards": numeric_rewards,
                "exception": current_exception,
            }
        )

    return {
        "schema_version": 2,
        "job": job_name,
        "mode": (evaluation_context or {}).get("mode"),
        "candidate": candidate,
        "evaluation_context": evaluation_context,
        "n_trials": len(trials),
        "n_exceptions": len(exceptions),
        "n_infrastructure_exceptions": len(exceptions),
        "metrics": {key: mean(items) for key, items in sorted(values.items())},
        "exceptions": exceptions,
        "trials": trials,
        "artifact_validation": artifact_validation or {"valid": False, "findings": [{"level": "error", "code": "ARTIFACT_VALIDATION_MISSING", "message": "Artifacts were not validated"}]},
    }


def summarize_job(job_dir: Path) -> dict[str, Any]:
    job_dir = job_dir.expanduser().resolve(strict=True)
    candidate_path = job_dir / "candidate-manifest.json"
    candidate = json.loads(candidate_path.read_text()) if candidate_path.exists() else None
    context_path = job_dir / CONTEXT_NAME
    evaluation_context = json.loads(context_path.read_text()) if context_path.exists() else None
    payloads = _trial_payloads(job_dir)
    return summarize_payloads(
        payloads,
        job_name=job_dir.name,
        candidate=candidate,
        evaluation_context=evaluation_context,
        artifact_validation=validate_job_artifacts(job_dir, expected_trials=len(payloads)),
    )


def write_summary(job_dir: Path, summary: dict[str, Any]) -> Path:
    output = job_dir / SUMMARY_NAME
    output.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n")
    return output


def load_or_create_summary(job_dir: Path) -> dict[str, Any]:
    job_dir = job_dir.expanduser().resolve(strict=True)
    path = job_dir / SUMMARY_NAME
    if path.exists():
        return json.loads(path.read_text())
    summary = summarize_job(job_dir)
    write_summary(job_dir, summary)
    return summary
