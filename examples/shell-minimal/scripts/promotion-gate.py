#!/usr/bin/env python3

"""Decide whether a new Candidate may replace the current baseline."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any


def load_trial(job_dir: Path) -> dict[str, Any]:
    trial_results = sorted(
        path
        for path in job_dir.glob("*/result.json")
        if path.parent.name != ".sources"
    )
    if len(trial_results) != 1:
        raise RuntimeError(
            f"Expected exactly one trial result in {job_dir}, found {len(trial_results)}"
        )
    return json.loads(trial_results[0].read_text())


def summarize(job_dir: Path) -> dict[str, Any]:
    trial = load_trial(job_dir)
    metadata = (trial.get("agent_result") or {}).get("metadata") or {}
    rewards = (trial.get("verifier_result") or {}).get("rewards") or {}
    exception = trial.get("exception_info")
    return {
        "job": job_dir.name,
        "version": metadata.get("candidate_version")
        or (trial.get("agent_info") or {}).get("version"),
        "digest": metadata.get("candidate_digest", "missing"),
        "file_exists": rewards.get("file_exists"),
        "correctness": rewards.get("correctness"),
        "reward": rewards.get("reward"),
        "exception": (exception or {}).get("exception_type"),
    }


def fmt(value: Any) -> str:
    return "-" if value is None else str(value)


def main() -> int:
    if len(sys.argv) != 3:
        print(f"Usage: {sys.argv[0]} <baseline-job-dir> <candidate-job-dir>")
        return 2

    baseline = summarize(Path(sys.argv[1]))
    candidate = summarize(Path(sys.argv[2]))

    print("| job | version | file_exists | correctness | reward | exception |")
    print("| --- | --- | ---: | ---: | ---: | --- |")
    for item in (baseline, candidate):
        print(
            f"| {item['job']} | {fmt(item['version'])} | "
            f"{fmt(item['file_exists'])} | {fmt(item['correctness'])} | "
            f"{fmt(item['reward'])} | {fmt(item['exception'])} |"
        )

    valid = baseline["exception"] is None and candidate["exception"] is None
    improved = (
        valid
        and isinstance(baseline["reward"], (int, float))
        and isinstance(candidate["reward"], (int, float))
        and candidate["reward"] > baseline["reward"]
        and candidate["correctness"] == 1
    )

    print()
    print(f"Baseline digest:  {baseline['digest']}")
    print(f"Candidate digest: {candidate['digest']}")
    print(f"Decision: {'PROMOTE candidate' if improved else 'REJECT candidate'}")
    return 0 if improved else 1


if __name__ == "__main__":
    raise SystemExit(main())
