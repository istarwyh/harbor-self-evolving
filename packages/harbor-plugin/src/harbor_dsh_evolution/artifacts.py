from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from pathlib import Path
from statistics import mean
from typing import Any, Iterable

from jsonschema import Draft202012Validator

SENSITIVE_KEY = re.compile(r"authorization|cookie|token|api[_-]?key|secret|password|request[_-]?headers", re.I)
MAX_TEXT = 8_000

_SCHEMAS: dict[str, dict[str, Any]] = {
    "evaluation-contract.json": {
        "type": "object",
        "required": ["schema_version", "contract_id", "version", "primary_metric", "metrics"],
        "properties": {
            "schema_version": {"const": 1},
            "contract_id": {"type": "string", "minLength": 1},
            "version": {"type": "string", "minLength": 1},
            "primary_metric": {"type": "string", "minLength": 1},
            "metrics": {"type": "array", "minItems": 1},
        },
    },
    "population-report.json": {
        "type": "object",
        "required": ["schema_version", "population_size", "groups", "metrics"],
        "properties": {
            "schema_version": {"const": 1},
            "population_size": {"type": "integer", "minimum": 0},
            "groups": {"type": "array"},
            "metrics": {"type": "object"},
        },
    },
    "trial-assessment.json": {
        "type": "object",
        "required": ["schema_version", "trial_id", "trial_name", "status", "rewards", "findings", "evidence", "process"],
        "properties": {
            "schema_version": {"const": 1},
            "trial_id": {"type": "string", "minLength": 1},
            "trial_name": {"type": "string"},
            "status": {"enum": ["assessed", "infrastructure-error"]},
            "rewards": {"type": "object", "additionalProperties": {"type": "number"}},
            "findings": {"type": "array"},
            "evidence": {"type": "array"},
            "process": {"type": "array"},
        },
    },
    "optimization-report.json": {
        "type": "object",
        "required": ["schema_version", "hypotheses"],
        "properties": {"schema_version": {"const": 1}, "hypotheses": {"type": "array"}},
    },
    "promotion-report.json": {
        "type": "object",
        "required": ["schema_version", "decision", "reasons"],
        "properties": {"schema_version": {"const": 2}, "decision": {"enum": ["PROMOTE", "REJECT"]}, "reasons": {"type": "array"}},
    },
}


def _schema_errors(name: str, value: Any) -> list[str]:
    return [
        error.message
        for error in Draft202012Validator(_SCHEMAS[name]).iter_errors(value)
    ]


def redact(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            str(key): "[REDACTED]" if SENSITIVE_KEY.search(str(key)) else redact(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [redact(item) for item in value[:200]]
    if isinstance(value, str) and len(value) > MAX_TEXT:
        return f"{value[:MAX_TEXT]}\n[TRUNCATED {len(value) - MAX_TEXT} chars]"
    return value


def trial_assessment(payload: dict[str, Any]) -> dict[str, Any]:
    exception = payload.get("exception_info")
    rewards = ((payload.get("verifier_result") or {}).get("rewards") or {})
    numeric = {
        key: float(value)
        for key, value in rewards.items()
        if isinstance(value, int | float) and not isinstance(value, bool)
    }
    evidence: list[dict[str, Any]] = []
    if exception:
        evidence.append(
            {
                "kind": "exception",
                "label": str(exception.get("exception_type") or "Exception"),
                "content": str(exception.get("exception_message") or ""),
            }
        )
    process = []
    for stage in ("environment_setup", "agent_setup", "agent_execution", "verifier"):
        value = payload.get(stage)
        if not isinstance(value, dict):
            continue
        process.append(
            {
                "stage": stage,
                "started_at": value.get("started_at"),
                "finished_at": value.get("finished_at"),
                "status": value.get("status"),
                "exception": value.get("exception_info"),
            }
        )
    output = payload.get("agent_result")
    verifier = payload.get("verifier_result")
    if output is None and isinstance(verifier, dict):
        output = {key: value for key, value in verifier.items() if key != "rewards"}
    return redact(
        {
            "schema_version": 1,
            "trial_id": str(payload.get("id") or payload.get("trial_name") or "unknown"),
            "trial_name": str(payload.get("trial_name") or "unknown"),
            "status": "infrastructure-error" if exception else "assessed",
            "rewards": numeric,
            "findings": [],
            "evidence": evidence,
            "output": output,
            "process": process,
        }
    )


def write_job_artifacts(
    job_dir: Path,
    payloads: Iterable[dict[str, Any]],
    *,
    evaluation_contract: dict[str, Any],
) -> dict[str, Any]:
    payloads = list(payloads)
    contract = {"schema_version": 1, **evaluation_contract}
    (job_dir / "evaluation-contract.json").write_text(
        json.dumps(redact(contract), ensure_ascii=False, indent=2) + "\n"
    )
    assessment_dir = job_dir / "trial-assessments"
    assessment_dir.mkdir(exist_ok=True)
    assessments: list[dict[str, Any]] = []
    for index, payload in enumerate(payloads):
        assessment = trial_assessment(payload)
        assessments.append(assessment)
        safe = re.sub(r"[^A-Za-z0-9._-]+", "-", assessment["trial_id"]).strip(".-") or f"trial-{index + 1}"
        (assessment_dir / f"{safe}.json").write_text(
            json.dumps(assessment, ensure_ascii=False, indent=2) + "\n"
        )
    metrics: dict[str, list[float]] = defaultdict(list)
    statuses = Counter()
    for assessment in assessments:
        statuses[assessment["status"]] += 1
        for key, value in assessment["rewards"].items():
            metrics[key].append(value)
    configured_groups = evaluation_contract.get("groups") or []
    groups: list[dict[str, Any]] = []
    for group in configured_groups:
        if not isinstance(group, dict) or not group.get("id") or not group.get("field"):
            continue
        buckets = Counter()
        for payload in payloads:
            value: Any = payload
            for part in str(group["field"]).split("."):
                value = value.get(part) if isinstance(value, dict) else None
            buckets[str(value) if value is not None else "unknown"] += 1
        groups.append(
            {
                "id": str(group["id"]),
                "label": group.get("label") or str(group["id"]),
                "field": str(group["field"]),
                "count": len(payloads),
                "values": [
                    {"value": value, "count": count}
                    for value, count in sorted(buckets.items())
                ],
            }
        )
    if not groups:
        groups = [
            {"id": status, "count": count}
            for status, count in sorted(statuses.items())
        ]
    population = {
        "schema_version": 1,
        "population_size": len(assessments),
        "groups": groups,
        "metrics": {key: mean(values) for key, values in sorted(metrics.items())},
    }
    (job_dir / "population-report.json").write_text(
        json.dumps(population, ensure_ascii=False, indent=2) + "\n"
    )
    return validate_job_artifacts(job_dir, expected_trials=len(assessments))


def validate_job_artifacts(job_dir: Path, *, expected_trials: int | None = None) -> dict[str, Any]:
    findings: list[dict[str, str]] = []
    required = ("evaluation-contract.json", "population-report.json")
    optional = ("optimization-report.json", "promotion-report.json")
    for name in (*required, *optional):
        path = job_dir / name
        if not path.is_file():
            if name in required:
                findings.append({"level": "error", "code": "ARTIFACT_MISSING", "message": f"{name} is missing"})
            continue
        try:
            value = json.loads(path.read_text())
            errors = _schema_errors(name, value)
            if errors:
                raise ValueError("; ".join(errors[:3]))
        except (json.JSONDecodeError, ValueError) as error:
            findings.append({"level": "error", "code": "ARTIFACT_SCHEMA_INVALID", "message": f"{name}: {error}"})
    assessments = list((job_dir / "trial-assessments").glob("*.json")) if (job_dir / "trial-assessments").is_dir() else []
    if expected_trials is not None and len(assessments) != expected_trials:
        findings.append({"level": "error", "code": "TRIAL_ASSESSMENT_COUNT_MISMATCH", "message": "Trial assessment count does not match Job trials"})
    for path in assessments:
        try:
            value = json.loads(path.read_text())
            errors = _schema_errors("trial-assessment.json", value)
            if errors:
                raise ValueError("; ".join(errors[:3]))
        except (json.JSONDecodeError, ValueError) as error:
            findings.append({"level": "error", "code": "ARTIFACT_SCHEMA_INVALID", "message": f"trial-assessments/{path.name}: {error}"})
    return {
        "valid": not any(item["level"] == "error" for item in findings),
        "checked": len(required) + sum((job_dir / name).is_file() for name in optional) + len(assessments),
        "findings": findings,
    }
