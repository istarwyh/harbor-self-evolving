from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path
from statistics import mean
from typing import Any, Iterable

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
) -> dict[str, Any]:
    values: dict[str, list[float]] = defaultdict(list)
    exceptions: list[dict[str, str]] = []
    trials: list[dict[str, Any]] = []
    for payload in payloads:
        rewards = ((payload.get("verifier_result") or {}).get("rewards") or {})
        numeric_rewards = {
            key: float(value)
            for key, value in rewards.items()
            if isinstance(value, int | float)
        }
        for key, value in numeric_rewards.items():
            values[key].append(value)
        exception = payload.get("exception_info")
        if exception:
            exceptions.append(
                {
                    "trial": str(payload.get("trial_name", "unknown")),
                    "type": str(exception.get("exception_type", "unknown")),
                    "message": str(exception.get("exception_message", "")),
                }
            )
        trials.append(
            {
                "name": payload.get("trial_name"),
                "rewards": numeric_rewards,
                "exception": exceptions[-1] if exception else None,
            }
        )

    return {
        "schema_version": 1,
        "job": job_name,
        "candidate": candidate,
        "n_trials": len(trials),
        "n_exceptions": len(exceptions),
        "metrics": {key: mean(items) for key, items in sorted(values.items())},
        "exceptions": exceptions,
        "trials": trials,
    }


def summarize_job(job_dir: Path) -> dict[str, Any]:
    job_dir = job_dir.expanduser().resolve(strict=True)
    candidate_path = job_dir / "candidate-manifest.json"
    candidate = json.loads(candidate_path.read_text()) if candidate_path.exists() else None
    return summarize_payloads(
        _trial_payloads(job_dir), job_name=job_dir.name, candidate=candidate
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
