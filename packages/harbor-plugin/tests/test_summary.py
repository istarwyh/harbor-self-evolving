import json
from pathlib import Path

from harbor_dsh_evolution.summary import summarize_job


def test_summarize_job_aggregates_rewards_exceptions_and_artifact_status(tmp_path: Path):
    (tmp_path / "candidate-manifest.json").write_text(json.dumps({"candidate_id": "demo", "digest": "sha256:" + "0" * 64}))
    (tmp_path / "evaluation-context.json").write_text(json.dumps({"schema_version": 2, "digest": "sha256:" + "c" * 64, "mode": "diagnostic"}))
    (tmp_path / "evaluation-contract.json").write_text(json.dumps({"schema_version": 1, "contract_id": "demo", "version": "1", "primary_metric": "reward", "metrics": [{"id": "reward"}]}))
    (tmp_path / "population-report.json").write_text(json.dumps({"schema_version": 1, "population_size": 2, "groups": [], "metrics": {"reward": 0.7}}))
    assessments = tmp_path / "trial-assessments"
    assessments.mkdir()
    for name in ("a", "b"):
        (assessments / f"{name}.json").write_text(json.dumps({"schema_version": 1, "trial_id": name, "trial_name": name, "status": "assessed", "rewards": {}, "findings": [], "evidence": [], "process": []}))
        trial = tmp_path / f"trial-{name}"
        trial.mkdir()
        (trial / "result.json").write_text(json.dumps({
            "id": name,
            "trial_name": name,
            "agent_info": {"name": "demo"},
            "verifier_result": {"rewards": {"reward": 0.4 if name == "a" else 1.0}},
            "exception_info": None if name == "a" else {"exception_type": "RuntimeError", "exception_message": "example"},
        }))
    summary = summarize_job(tmp_path)
    assert summary["schema_version"] == 2
    assert summary["n_trials"] == 2
    assert summary["n_infrastructure_exceptions"] == 1
    assert summary["metrics"] == {"reward": 0.7}
    assert summary["artifact_validation"]["valid"] is True
