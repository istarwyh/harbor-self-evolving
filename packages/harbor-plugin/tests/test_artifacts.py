import json
from pathlib import Path

from harbor_dsh_evolution.artifacts import trial_assessment, write_job_artifacts


CONTRACT = {
    "contract_id": "search",
    "version": "2",
    "primary_metric": "reward",
    "metrics": [{"id": "reward", "direction": "maximize"}],
    "hard_requirements": [
        {"id": "input_integrity"},
        {"id": "agent_completed"},
        {"id": "integration_valid"},
        {"id": "renderer_valid"},
        {"id": "judge_completed"},
        {"id": "artifact_schema_valid"},
    ],
}


def payload(identity: str, *, exception=False, rendered=False):
    verifier = {
        "rewards": {"reward": 0.9},
        "validity": {"renderer_valid": rendered},
    }
    if rendered:
        verifier["rendered_output"] = {"answer": "evidence-backed"}
    return {
        "id": identity,
        "task_name": identity,
        "trial_name": identity,
        "agent_result": {"metadata": {"candidate": "v2"}},
        "verifier_result": verifier,
        "exception_info": {"exception_type": "Timeout", "exception_message": "/private/path token=secret"} if exception else None,
    }


def test_invalid_raw_reward_is_audit_only_and_runtime_metadata_is_not_renderer():
    assessment = trial_assessment(
        payload("q1", rendered=False),
        evaluation_contract=CONTRACT,
        task={"id": "q1", "query": "find a source"},
    )
    assert assessment["raw_rewards"] == {"reward": 0.9}
    assert assessment["score"] == {
        "value": None,
        "valid": False,
        "invalid_reasons": ["requirement-failed:renderer_valid"],
    }
    assert assessment["status"] == "candidate-quality-failed"
    assert assessment["evidence_provenance"][0]["label"] == "Agent Result Metadata"
    assert all(item["label"] != "Real Renderer" for item in assessment["evidence_provenance"])


def test_collected_agent_artifact_becomes_the_renderable_output(tmp_path: Path):
    trial = tmp_path / "trial-1"
    artifact = trial / "artifacts" / "app" / "research-result.json"
    artifact.parent.mkdir(parents=True)
    artifact.write_text(json.dumps({"answer": "Evidence-backed document", "citations": [{"source_id": "doc-1"}]}))
    (trial / "artifacts" / "manifest.json").write_text(json.dumps([{"destination": "artifacts/app/research-result.json", "status": "ok"}]))
    current = payload("artifact", rendered=False)
    current["trial_uri"] = trial.as_uri()
    current["verifier_result"]["validity"]["renderer_valid"] = True
    write_job_artifacts(tmp_path, [current], evaluation_contract=CONTRACT)
    assessment = json.loads((tmp_path / "trial-assessments" / "artifact.json").read_text())
    assert assessment["output"]["kind"] == "document"
    assert assessment["output"]["content"]["answer"] == "Evidence-backed document"
    assert assessment["evidence_provenance"][0]["label"] == "Agent Artifact"


def test_trial_assessment_preserves_evaluator_reasons_and_recommendations(tmp_path: Path):
    trial = tmp_path / "trial-reason"
    verifier = trial / "verifier"
    verifier.mkdir(parents=True)
    (verifier / "evaluation-result.json").write_text(
        json.dumps(
            {
                "schema_version": 1,
                "protocol": "evaluation-result/v1",
                "criteria": [
                    {
                        "id": "quality",
                        "score": 0.5,
                        "reason": "Only one of two required concepts was covered.",
                        "recommendation": "Add the missing concept and rerun the Trial.",
                    }
                ],
            }
        )
    )
    current = payload("trial-reason", rendered=True)
    current["trial_uri"] = trial.as_uri()
    current["verifier_result"]["rewards"]["quality"] = 0.5
    contract = {
        **CONTRACT,
        "metrics": [
            {"id": "reward", "direction": "maximize"},
            {"id": "quality", "label": "回应问题", "direction": "maximize"},
        ],
    }

    write_job_artifacts(tmp_path, [current], evaluation_contract=contract)
    assessment = json.loads((tmp_path / "trial-assessments" / "trial-reason.json").read_text())
    assert assessment["criteria"][0]["reason"] == "Only one of two required concepts was covered."
    assert assessment["criteria"][0]["recommendation"] == "Add the missing concept and rerun the Trial."
    assert assessment["criteria"][0]["recommendation_source"] == "evaluator"
    assert assessment["recommendations"][0]["criterion_id"] == "quality"


def test_artifact_registry_and_population_include_only_valid_scores(tmp_path: Path):
    valid = payload("valid", rendered=True)
    failed = payload("failed", exception=True, rendered=True)
    validation = write_job_artifacts(tmp_path, [valid, failed], evaluation_contract=CONTRACT)
    assert validation["valid"] is True
    population = json.loads((tmp_path / "population-report.json").read_text())
    assert population["population_size"] == 2
    assert population["valid_population_size"] == 1
    assert population["metrics"] == {"reward": 0.9}
    registry = json.loads((tmp_path / "artifact-registry.json").read_text())
    assert any(item["artifact"] == "Trial Assessment" and item["reward_affecting"] for item in registry["artifacts"])
    assert not any(item["artifact"] == "Evaluation Process" for item in registry["artifacts"])
    assert not (tmp_path / "evaluation-process.json").exists()
    assert json.loads((tmp_path / "optimization-report.json").read_text())["hook"]["reward_affecting"] is False
    failed_assessment = json.loads((tmp_path / "trial-assessments" / "failed.json").read_text())
    assert failed_assessment["score"]["value"] is None
    assert failed_assessment["exception"]["message"].startswith("Execution failed")


def test_optimizer_proposes_one_guarded_experiment_for_weak_valid_dimension(tmp_path: Path):
    contract = {
        **CONTRACT,
        "metrics": [
            {"id": "reward", "direction": "maximize"},
            {"id": "citation_accuracy", "label": "引用规范性", "direction": "maximize"},
        ],
    }
    current = payload("weak-citation", rendered=True)
    current["verifier_result"]["rewards"]["citation_accuracy"] = 0
    write_job_artifacts(tmp_path, [current], evaluation_contract=contract)
    assessment = json.loads((tmp_path / "trial-assessments" / "weak-citation.json").read_text())
    assert assessment["criteria"] == [
        {
            "id": "citation_accuracy",
            "label": "引用规范性",
            "score": 0.0,
            "status": "measured",
            "evidence_refs": ["renderer-output"],
        }
    ]
    report = json.loads((tmp_path / "optimization-report.json").read_text())
    assert len(report["hypotheses"]) == 1
    hypothesis = report["hypotheses"][0]
    assert hypothesis["root_cause"] == "candidate-quality:citation_accuracy"
    assert hypothesis["mutation_surface"] == []
    assert "evaluator" in hypothesis["forbidden_surface"]
    assert hypothesis["next_experiment"]
