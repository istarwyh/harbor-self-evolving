import json
from pathlib import Path

from jsonschema import Draft202012Validator

from harbor_dsh_evolution.artifacts import exception_summary, trial_assessment, write_job_artifacts


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
        {"id": "evaluator_identity_match"},
        {"id": "artifact_schema_valid"},
    ],
}


IDENTITY = {
    "id": "strict-evaluator",
    "version": "1.0.0",
    "portable_digest": "sha256:" + "a" * 64,
}


def evaluator_interface(criteria):
    return {
        "evaluator_id": IDENTITY["id"],
        "version": IDENTITY["version"],
        "portable_digest": IDENTITY["portable_digest"],
        "interface": "harbor-dsh-evaluator/v2",
        "bundle_complete": True,
        "protocol": {"input": "evaluation-input/v2", "output": "evaluation-result/v2"},
        "criteria": [{"id": item["id"], "label": item["id"], "values": [0, 0.5, 1], "required": False} for item in criteria],
        "aggregate": {"metric_id": "reward", "method": "mean"},
    }


def evaluation_result(criteria):
    identity = {**IDENTITY, "bundle_complete": True}
    normalized = [{
        **item,
        "status": "scored",
        "evidence_refs": item.get("evidence_refs", ["captured-output"]),
    } for item in criteria]
    values = [float(item["score"]) for item in normalized]
    return {
        "schema_version": 2,
        "protocol": "evaluation-result/v2",
        "criteria": normalized,
        "aggregate": {
            "metric_id": "reward",
            "value": round(sum(values) / len(values), 6),
            "scored_criteria": len(values),
            "total_criteria": len(values),
            "coverage": 1.0,
        },
        "effective_evaluator": {
            "schema_version": 1,
            "protocol": "effective-evaluator/v1",
            "configured": IDENTITY,
            "materialized": identity,
            "executed": identity,
            "identity_match": True,
            "execution": {"status": "succeeded", "error_type": None},
        },
    }


def stack_manifest(criteria):
    return {"components": {"evaluator": {"interface": evaluator_interface(criteria)}}}


def materialize_result(job_dir: Path, current: dict, criteria):
    if current.get("trial_uri"):
        trial_dir = Path(current["trial_uri"].removeprefix("file://"))
    else:
        trial_dir = job_dir / f"runtime-{current['id']}"
        trial_dir.mkdir()
        current["trial_uri"] = trial_dir.as_uri()
    verifier = trial_dir / "verifier"
    verifier.mkdir(exist_ok=True)
    (verifier / "evaluation-result.json").write_text(json.dumps(evaluation_result(criteria)))


def payload(identity: str, *, exception=False, rendered=False):
    verifier = {
        "rewards": {"reward": 0.9},
        "validity": {"renderer_valid": rendered},
    }
    if rendered:
        verifier["rendered_output"] = {"answer": "evidence-backed"}
    criteria = [{
        "id": "reward",
        "score": 0.5,
        "reason": "The strict Evaluator measured this Trial.",
        "recommendation": "Preserve the measured behavior.",
    }]
    return {
        "id": identity,
        "task_name": identity,
        "trial_name": identity,
        "agent_result": {"metadata": {"candidate": "v2"}},
        "verifier_result": verifier,
        "evaluator_interface": evaluator_interface(criteria),
        "evaluator_result": evaluation_result(criteria),
        "exception_info": {"exception_type": "Timeout", "exception_message": "/private/path token=secret"} if exception else None,
    }


def test_invalid_raw_reward_is_audit_only_and_runtime_metadata_is_not_renderer():
    assessment = trial_assessment(
        payload("q1", rendered=False),
        evaluation_contract=CONTRACT,
        task={"id": "q1", "query": "find a source"},
    )
    assert assessment["raw_rewards"] == {"reward": 0.9}
    assert assessment["score"]["value"] is None
    assert assessment["score"]["valid"] is False
    assert "requirement-failed:renderer_valid" in assessment["score"]["invalid_reasons"]
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
    strict_criteria = current["evaluator_result"]["criteria"]
    materialize_result(tmp_path, current, strict_criteria)
    write_job_artifacts(tmp_path, [current], evaluation_contract=CONTRACT, stack_manifest=stack_manifest(strict_criteria))
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
    strict_criteria = [{
        "id": "quality",
        "score": 0.5,
        "reason": "Only one of two required concepts was covered.",
        "recommendation": "Add the missing concept and rerun the Trial.",
    }]
    materialize_result(tmp_path, current, strict_criteria)
    contract = {
        **CONTRACT,
        "metrics": [
            {"id": "reward", "direction": "maximize"},
            {"id": "quality", "label": "回应问题", "direction": "maximize"},
        ],
    }

    write_job_artifacts(tmp_path, [current], evaluation_contract=contract, stack_manifest=stack_manifest(strict_criteria))
    assessment = json.loads((tmp_path / "trial-assessments" / "trial-reason.json").read_text())
    assert assessment["criteria"][0]["reason"] == "Only one of two required concepts was covered."
    assert assessment["criteria"][0]["recommendation"] == "Add the missing concept and rerun the Trial."
    assert assessment["criteria"][0]["recommendation_source"] == "evaluator"
    assert assessment["recommendations"][0]["criterion_id"] == "quality"


def test_exception_summary_redacts_credential_families_and_local_paths():
    cases = [
        ("Bearer bearer-secret-material", "bearer-secret-material"),
        ("Basic dXNlcjpwYXNzd29yZA==", "dXNlcjpwYXNzd29yZA=="),
        ("https://alice:supersecret@example.com", "supersecret"),
        ("https://superopaque@example.com", "superopaque"),
        ("postgres://dbtoken@localhost", "dbtoken"),
        ("eyJheader.payloadsegment.signaturepart", "eyJheader"),
        ("ghp_abcdefghijklmnopqrstuvwxyz123456", "ghp_abcdefghijklmnopqrstuvwxyz123456"),
        ("github_pat_abcdefghijklmnopqrstuvwxyz123456", "github_pat_abcdefghijklmnopqrstuvwxyz123456"),
        ("-".join(["xoxb", "123456789012", "syntheticfixtureonly"]), "syntheticfixtureonly"),
        ("sk-proj-abcdefghijklmnopqrstuv", "sk-proj-abcdefghijklmnopqrstuv"),
        ("AKIAABCDEFGHIJKLMNOP", "AKIAABCDEFGHIJKLMNOP"),
        ("ASIAABCDEFGHIJKLMNOP", "ASIAABCDEFGHIJKLMNOP"),
        (
            "-----BEGIN PRIVATE KEY-----\nopaque-private-material\n-----END PRIVATE KEY-----",
            "opaque-private-material",
        ),
        ("-----BEGIN PRIVATE KEY-----\ntruncated-private-material", "truncated-private-material"),
        ("failure at /Users/alice/private/report.json", "/Users/alice/private/report.json"),
        ("path=/private", "/private"),
        ("failure at /tmp", "/tmp"),
        (r"failure at C:\Users\Alice\private\report.txt", r"C:\Users\Alice\private\report.txt"),
    ]
    for diagnostic, forbidden in cases:
        result = exception_summary(
            {"exception_type": "RuntimeError", "exception_message": diagnostic}
        )
        serialized = json.dumps(result)
        assert forbidden not in serialized
        assert "REDACTED" in serialized or "local path" in serialized

    result = exception_summary(
        {
            "exception_type": "Bearer exception-type-secret",
            "exception_message": "execution failed",
        }
    )
    assert "exception-type-secret" not in json.dumps(result)


def test_trial_assessment_redacts_output_reason_and_recommendation_strings():
    current = payload("redacted-evidence", rendered=True)
    current["verifier_result"]["rendered_output"] = {
        "answer": "Bearer rendered-output-secret",
        "headers": {"opaque": "header-container-secret"},
        "environmentVariables": {"OPAQUE": "environment-container-secret"},
        "credentialsMap": {"opaque": "credential-container-secret"},
    }
    current["verifier_result"]["rewards"]["quality"] = 0.5
    current["evaluator_result"] = {
        "criteria": [
            {
                "id": "quality",
                "reason": "eyJreason.segmentvalue.signaturevalue",
                "recommendation": "retry https://alice:recommendation-secret@example.com",
            }
        ],
        "recommendations": [
            {"message": "rotate ghp_abcdefghijklmnopqrstuvwxyz123456"}
        ],
    }
    contract = {
        **CONTRACT,
        "metrics": [
            {"id": "reward", "direction": "maximize"},
            {"id": "quality", "direction": "maximize"},
        ],
    }

    assessment = trial_assessment(current, evaluation_contract=contract)
    serialized = json.dumps(assessment)
    for forbidden in (
        "rendered-output-secret",
        "eyJreason",
        "recommendation-secret",
        "ghp_abcdefghijklmnopqrstuvwxyz123456",
        "header-container-secret",
        "environment-container-secret",
        "credential-container-secret",
    ):
        assert forbidden not in serialized
    assert serialized.count("REDACTED") >= 4


def test_artifact_registry_and_population_include_only_valid_scores(tmp_path: Path):
    valid = payload("valid", rendered=True)
    failed = payload("failed", exception=True, rendered=True)
    strict_criteria = valid["evaluator_result"]["criteria"]
    materialize_result(tmp_path, valid, strict_criteria)
    materialize_result(tmp_path, failed, strict_criteria)
    validation = write_job_artifacts(tmp_path, [valid, failed], evaluation_contract=CONTRACT, stack_manifest=stack_manifest(strict_criteria))
    assert validation["valid"] is True
    population = json.loads((tmp_path / "population-report.json").read_text())
    assert population["population_size"] == 2
    assert population["valid_population_size"] == 1
    assert population["metrics"] == {"reward": 0.5}
    schema_root = Path(__file__).parents[3] / "schemas"
    registry = json.loads((tmp_path / "artifact-registry.json").read_text())
    registry_schema = json.loads((schema_root / "artifact-registry.schema.json").read_text())
    Draft202012Validator(registry_schema).validate(registry)
    assessment_schema = json.loads((schema_root / "trial-assessment.schema.json").read_text())
    assessment_schema["properties"]["effective_evaluator"]["anyOf"][0] = json.loads(
        (schema_root / "effective-evaluator.schema.json").read_text()
    )
    valid_assessment = json.loads((tmp_path / "trial-assessments" / "valid.json").read_text())
    Draft202012Validator(assessment_schema).validate(valid_assessment)
    assert any(item["artifact"] == "Trial Assessment" and item["reward_affecting"] for item in registry["artifacts"])
    assert not any(item["artifact"] == "Evaluation Process" for item in registry["artifacts"])
    assert not (tmp_path / "evaluation-process.json").exists()
    assert json.loads((tmp_path / "optimization-report.json").read_text())["hook"]["reward_affecting"] is False
    failed_assessment = json.loads((tmp_path / "trial-assessments" / "failed.json").read_text())
    assert failed_assessment["score"]["value"] is None
    # The causal error is surfaced (not the generic "Execution failed" wrapper)
    # and the secret value is redacted.
    assert failed_assessment["exception"]["message"] == "[local path]"


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
    strict_criteria = [{
        "id": "citation_accuracy",
        "score": 0,
        "reason": "The citation is missing.",
        "recommendation": "Add one valid citation.",
    }]
    materialize_result(tmp_path, current, strict_criteria)
    write_job_artifacts(tmp_path, [current], evaluation_contract=contract, stack_manifest=stack_manifest(strict_criteria))
    assessment = json.loads((tmp_path / "trial-assessments" / "weak-citation.json").read_text())
    assert assessment["criteria"] == [
        {
            "id": "citation_accuracy",
            "label": "引用规范性",
            "score": 0.0,
            "status": "measured",
            "evidence_refs": ["captured-output"],
            "reason": "The citation is missing.",
            "recommendation": "Add one valid citation.",
            "recommendation_source": "evaluator",
        }
    ]
    report = json.loads((tmp_path / "optimization-report.json").read_text())
    assert len(report["hypotheses"]) == 1
    hypothesis = report["hypotheses"][0]
    assert hypothesis["root_cause"] == "candidate-quality:citation_accuracy"
    assert hypothesis["mutation_surface"] == []
    assert "evaluator" in hypothesis["forbidden_surface"]
    assert hypothesis["next_experiment"]
