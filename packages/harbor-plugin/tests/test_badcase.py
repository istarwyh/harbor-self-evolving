from __future__ import annotations

import json
from pathlib import Path

import pytest

from harbor_dsh_evolution.badcase import materialize_badcase_dataset, preview_badcase_dataset
from harbor_dsh_evolution.job_seal import seal_job_bundle


def _sealed_historical_job(root: Path, *, duplicate_alias: bool = False) -> Path:
    job = root / "jobs" / "historical-source"
    assessments = job / "trial-assessments"
    assessments.mkdir(parents=True)
    for name, value in {
        "evaluation-summary.json": {"schema_version": 4, "job_kind": "historical-generation-evaluation"},
        "evaluation-context.json": {"schema_version": 3, "protocol": "historical-generation-evaluation-context/v3"},
        "evaluation-stack-manifest.json": {"schema_version": 1, "stack_id": "historical"},
        "dataset-manifest.json": {"schema_version": 1, "dataset_id": "sessions"},
    }.items():
        (job / name).write_text(json.dumps(value) + "\n")
    (assessments / "session-1.json").write_text(json.dumps({
        "schema_version": 3,
        "trial_id": "session-1",
        "dataset_trial": "01-session-1",
        "status": "completed-unscored",
        "query": "Repair the reviewed behavior.",
        "criteria": [{
            "id": "evidence_alignment",
            "status": "insufficient-evidence",
            "score": None,
            "reason": "The result lacks a bounded test outcome.",
            "recommendation": "Require one deterministic test summary.",
            "evidence_refs": ["generation_record.execution.evidence_summaries"],
        }],
        "output": {"raw_tool_payload": "Bearer raw-session-secret-must-not-copy"},
    }) + "\n")
    if duplicate_alias:
        duplicate = json.loads((assessments / "session-1.json").read_text())
        duplicate["trial_id"] = "session-2"
        duplicate["dataset_trial"] = "01-session-1"
        (assessments / "session-2.json").write_text(json.dumps(duplicate) + "\n")
    seal_job_bundle(job)
    return job


def test_badcase_dataset_requires_reviewed_plan_and_copies_only_bounded_summaries(tmp_path: Path):
    job = _sealed_historical_job(tmp_path)
    output = tmp_path / "datasets" / "reviewed-regressions"
    plan = preview_badcase_dataset(
        project_root=tmp_path,
        job_dir=job,
        trial_ids=["session-1"],
        output=output,
        dataset_id="reviewed-regressions", version="1.0.0",
    )
    assert plan["protocol"] == "historical-badcase-dataset-plan/v1"
    assert plan["review_required"] is True
    assert plan["promotion_eligible"] is False

    with pytest.raises(ValueError, match="HUMAN_CONFIRMATION_REQUIRED"):
        materialize_badcase_dataset(
            project_root=tmp_path, job_dir=job, trial_ids=["session-1"], output=output,
            expected_plan_digest=plan["digest"], confirmed=False,
            dataset_id="reviewed-regressions", version="1.0.0",
        )
    with pytest.raises(ValueError, match="BADCASE_PLAN_STALE"):
        materialize_badcase_dataset(
            project_root=tmp_path, job_dir=job, trial_ids=["session-1"], output=output,
            expected_plan_digest="sha256:" + "0" * 64, confirmed=True,
            dataset_id="reviewed-regressions", version="1.0.0",
        )

    result = materialize_badcase_dataset(
        project_root=tmp_path, job_dir=job, trial_ids=["session-1"], output=output,
        expected_plan_digest=plan["digest"], confirmed=True,
        dataset_id="reviewed-regressions", version="1.0.0",
    )
    instruction = next(output.glob("*/instruction.md")).read_text()
    assert result["protocol"] == "historical-badcase-dataset/v1"
    assert result["manifest"]["metadata"]["reviewed_badcases"]["promotion_eligible"] is False
    assert "Require one deterministic test summary" in instruction
    assert "raw-session-secret-must-not-copy" not in instruction
    assert "not promotion-eligible" in instruction


def test_badcase_preview_rejects_tampered_sealed_source(tmp_path: Path):
    job = _sealed_historical_job(tmp_path)
    assessment = job / "trial-assessments" / "session-1.json"
    assessment.chmod(0o644)
    assessment.write_text(assessment.read_text().replace("Repair", "Tampered"))
    with pytest.raises(ValueError, match="JOB_BUNDLE_ARTIFACT_TAMPERED"):
        preview_badcase_dataset(
            project_root=tmp_path,
            job_dir=job,
            trial_ids=["session-1"],
            output=tmp_path / "regressions",
            dataset_id="reviewed-regressions", version="1.0.0",
        )


def test_badcase_plan_binds_dataset_id_and_version(tmp_path: Path):
    job = _sealed_historical_job(tmp_path)
    output = tmp_path / "regressions"
    plan = preview_badcase_dataset(
        project_root=tmp_path, job_dir=job, trial_ids=["session-1"], output=output,
        dataset_id="reviewed-regressions", version="1.0.0",
    )
    assert plan["dataset_id"] == "reviewed-regressions"
    assert plan["version"] == "1.0.0"
    with pytest.raises(ValueError, match="BADCASE_PLAN_STALE"):
        materialize_badcase_dataset(
            project_root=tmp_path, job_dir=job, trial_ids=["session-1"], output=output,
            expected_plan_digest=plan["digest"], confirmed=True,
            dataset_id="reviewed-regressions", version="2.0.0",
        )


def test_badcase_preview_rejects_alias_collisions_and_unsealed_symlinks(tmp_path: Path):
    collision = _sealed_historical_job(tmp_path, duplicate_alias=True)
    with pytest.raises(ValueError, match="alias is ambiguous"):
        preview_badcase_dataset(
            project_root=tmp_path, job_dir=collision, trial_ids=["session-1"], output=tmp_path / "collision",
            dataset_id="reviewed-regressions", version="1.0.0",
        )

    other_root = tmp_path / "other"
    other_root.mkdir()
    job = _sealed_historical_job(other_root)
    outside = tmp_path / "outside.json"
    outside.write_text("{}")
    (job / "trial-assessments" / "linked.json").symlink_to(outside)
    with pytest.raises(ValueError, match="sealed regular file"):
        preview_badcase_dataset(
            project_root=other_root, job_dir=job, trial_ids=["session-1"], output=other_root / "linked",
            dataset_id="reviewed-regressions", version="1.0.0",
        )
