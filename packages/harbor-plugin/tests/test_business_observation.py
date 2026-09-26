from __future__ import annotations

import copy
import json
import subprocess
from pathlib import Path

import pytest

from harbor_dsh_evolution.business_observation import (
    DuplicateObservationError,
    ObservationIdConflictError,
    business_observation_digest,
    import_business_observation,
    list_business_observations,
    load_business_observation_file,
    prepare_business_observation,
    validate_business_observation,
)


CANDIDATE_A = "sha256:" + "a" * 64
CANDIDATE_B = "sha256:" + "b" * 64


def observation(
    observation_id: str = "support-resolution-2026w39",
    *,
    candidate_digest: str | None = CANDIDATE_A,
    value: float = 0.74,
    deployment_id: str = "production-a",
    segment: bool = True,
) -> dict:
    subject = {
        "generator_id": "support-agent",
        "deployment_id": deployment_id,
        **({"candidate_digest": candidate_digest} if candidate_digest else {"project_id": "support-project"}),
    }
    value = {
        "schema_version": 1,
        "protocol": "business-observation/v1",
        "observation_id": observation_id,
        "source": {
            "kind": "analytics",
            "id": "support-dashboard",
            "version": "query-v3",
            "provenance": "human-reviewed aggregate export",
        },
        "subject": subject,
        "window": {
            "from": "2026-09-21T00:00:00Z",
            "through": "2026-09-27T23:59:59Z",
        },
        "metrics": [
            {
                "id": "resolution_rate",
                "value": value,
                "unit": "ratio",
                "direction": "maximize",
                "sample_size": 1830,
            }
        ],
        "segments": [],
    }
    if segment:
        value["segments"] = [
            {
                "id": "enterprise",
                "label": "Enterprise",
                "dimensions": [{"id": "plan", "value": "enterprise"}],
                "metrics": [
                    {
                        "id": "resolution_rate",
                        "value": min(value["metrics"][0]["value"] + 0.01, 1),
                        "unit": "ratio",
                        "direction": "maximize",
                        "sample_size": 800,
                    }
                ],
            }
        ]
    return value


def finalized(**kwargs) -> dict:
    return prepare_business_observation(observation(**kwargs))


def test_validates_source_subject_window_metrics_segments_and_digest():
    value = finalized()

    assert validate_business_observation(value) == value
    assert value["digest"] == business_observation_digest(value)
    assert value["source"]["provenance"] == "human-reviewed aggregate export"
    assert value["subject"]["candidate_digest"] == CANDIDATE_A


def test_prepare_rejects_malformed_shape_before_digest_materialization():
    value = observation()
    value["metrics"] = [{}]

    with pytest.raises(ValueError, match="BUSINESS_OBSERVATION_SCHEMA_INVALID"):
        prepare_business_observation(value)


def test_rejects_missing_provenance_or_subject_identity():
    value = observation()
    del value["source"]["provenance"]
    with pytest.raises(ValueError, match="SCHEMA_INVALID"):
        prepare_business_observation(value)

    value = observation()
    value["subject"] = {}
    with pytest.raises(ValueError, match="SCHEMA_INVALID"):
        prepare_business_observation(value)


def test_project_level_subject_is_valid_but_not_candidate_bound():
    value = finalized(candidate_digest=None)
    assert value["subject"]["project_id"] == "support-project"
    assert "candidate_digest" not in value["subject"]


def test_rejects_invalid_time_windows_and_metric_semantics():
    value = observation()
    value["window"]["from"] = "2026-09-21T00:00:00"
    with pytest.raises(ValueError, match="WINDOW_INVALID"):
        prepare_business_observation(value)

    value = observation()
    value["window"]["through"] = value["window"]["from"]
    with pytest.raises(ValueError, match="WINDOW_INVALID"):
        prepare_business_observation(value)

    value = observation(value=1.1)
    with pytest.raises(ValueError, match="ratio metric"):
        prepare_business_observation(value)

    value = observation()
    value["metrics"].append(copy.deepcopy(value["metrics"][0]))
    with pytest.raises(ValueError, match="duplicate metric"):
        prepare_business_observation(value)

    value = observation()
    value["metrics"][0]["value"] = float("nan")
    with pytest.raises(ValueError, match="must be finite"):
        prepare_business_observation(value)

    value = observation()
    value["metrics"][0]["sample_size"] = 9_007_199_254_740_992
    with pytest.raises(ValueError, match="SCHEMA_INVALID"):
        prepare_business_observation(value)


def test_rejects_inconsistent_segments():
    value = observation()
    value["segments"][0]["metrics"][0]["direction"] = "minimize"
    with pytest.raises(ValueError, match="preserve unit and direction"):
        prepare_business_observation(value)

    value = observation()
    value["segments"][0]["metrics"][0]["sample_size"] = 2000
    with pytest.raises(ValueError, match="sample_size exceeds"):
        prepare_business_observation(value)

    value = observation()
    value["segments"][0]["metrics"][0]["id"] = "undeclared_metric"
    with pytest.raises(ValueError, match="not declared"):
        prepare_business_observation(value)


def test_rejects_sensitive_fields_secret_values_and_local_paths():
    value = observation()
    value["api_key"] = "not-even-needed"
    with pytest.raises(ValueError, match="SENSITIVE_FIELD"):
        prepare_business_observation(value)

    value = observation()
    value["source"]["provenance"] = "Bearer top-secret-value"
    with pytest.raises(ValueError, match="SENSITIVE_VALUE"):
        prepare_business_observation(value)

    value = observation()
    value["source"]["provenance"] = "reviewed at /Users/alice/private/export.json"
    with pytest.raises(ValueError, match="local paths"):
        prepare_business_observation(value)

    value = observation()
    value["source"]["provenance"] = "reviewed by alice@example.com"
    with pytest.raises(ValueError, match="PERSONAL_DATA"):
        prepare_business_observation(value)

    value = observation()
    value["segments"][0]["dimensions"] = [{"id": "customer_id", "value": "customer-123"}]
    with pytest.raises(ValueError, match="PERSONAL_DIMENSION"):
        prepare_business_observation(value)


def test_import_file_and_payload_are_project_bound_and_non_overwriting(tmp_path: Path):
    source = tmp_path / "reviewed.json"
    source.write_text(json.dumps(observation()))

    result = import_business_observation(project_root=tmp_path, input_path=source)
    stored = tmp_path / result["stored_path"]

    assert result["status"] == "imported"
    assert result["network_access"] is False
    assert result["source_path"] == "reviewed.json"
    assert load_business_observation_file(project_root=tmp_path, input_path=stored)["digest"] == result["digest"]

    with pytest.raises(DuplicateObservationError, match="already imported"):
        import_business_observation(project_root=tmp_path, observation=observation())

    conflict = observation()
    conflict["source"]["version"] = "query-v4"
    with pytest.raises(ObservationIdConflictError, match="different content"):
        import_business_observation(project_root=tmp_path, observation=conflict)


def test_import_rejects_outside_and_symlink_inputs(tmp_path: Path):
    outside = tmp_path.parent / "outside-business-observation.json"
    outside.write_text(json.dumps(observation()))
    try:
        with pytest.raises(ValueError, match="UNSAFE_PATH"):
            import_business_observation(project_root=tmp_path, input_path=outside)

        link = tmp_path / "linked.json"
        link.symlink_to(outside)
        with pytest.raises(ValueError, match="symlink"):
            import_business_observation(project_root=tmp_path, input_path=link)
    finally:
        outside.unlink(missing_ok=True)


def test_list_filters_projects_trends_and_keeps_subjects_separate(tmp_path: Path):
    first = observation("week-1", value=0.70, deployment_id="production-a")
    second = observation("week-2", value=0.74, deployment_id="production-a")
    second["window"] = {"from": "2026-09-28T00:00:00Z", "through": "2026-10-04T23:59:59Z"}
    third = observation("week-3", candidate_digest=CANDIDATE_B, value=0.80, deployment_id="production-b")
    for value in (first, second, third):
        import_business_observation(project_root=tmp_path, observation=value)

    result = list_business_observations(
        project_root=tmp_path,
        candidate_digest=CANDIDATE_A,
        metric_id="resolution_rate",
        limit=10,
    )
    assert result["pagination"]["total"] == 2
    assert [item["observation_id"] for item in result["observations"]] == ["week-2", "week-1"]
    assert len(result["trends"]) == 1
    assert result["trends"][0]["subject"]["deployment_id"] == "production-a"
    assert [point["value"] for point in result["trends"][0]["points"]] == [0.70, 0.74]
    assert result["groups"][0]["observation_count"] == 2
    assert result["causality"] == {
        "status": "correlation-only",
        "label": "Associated observations are correlational and do not establish causation.",
        "affects_offline_evaluation": False,
        "affects_reward": False,
        "affects_gate": False,
    }

    all_results = list_business_observations(project_root=tmp_path, limit=10)
    assert len(all_results["trends"]) == 2

    segment = list_business_observations(project_root=tmp_path, segment_id="enterprise", limit=10)
    assert all(item["segment_id"] == "enterprise" for item in segment["trends"])

    bounded = list_business_observations(project_root=tmp_path, candidate_digest=CANDIDATE_A, limit=1)
    assert len(bounded["observations"]) == 1
    assert len(bounded["trends"]) <= 1
    assert len(bounded["trends"][0]["points"]) == 1
    assert bounded["groups"][0]["observation_count"] == 1


def test_cli_import_validate_and_list_support_file_and_structured_payload(tmp_path: Path):
    first = observation("cli-payload")
    import_result = subprocess.run(
        [
            str(Path(__file__).parents[1] / ".venv" / "bin" / "python"),
            "-m",
            "harbor_dsh_evolution.cli",
            "business-observation",
            "import",
            "--project-root",
            str(tmp_path),
            "--payload-stdin",
        ],
        input=json.dumps(first),
        check=True,
        capture_output=True,
        text=True,
    )
    imported = json.loads(import_result.stdout)
    assert imported["status"] == "imported"
    assert imported["network_access"] is False

    stored = tmp_path / imported["stored_path"]
    validation_result = subprocess.run(
        [
            str(Path(__file__).parents[1] / ".venv" / "bin" / "python"),
            "-m",
            "harbor_dsh_evolution.cli",
            "business-observation",
            "validate",
            "--project-root",
            str(tmp_path),
            "--input",
            str(stored),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    assert json.loads(validation_result.stdout)["valid"] is True

    list_result = subprocess.run(
        [
            str(Path(__file__).parents[1] / ".venv" / "bin" / "python"),
            "-m",
            "harbor_dsh_evolution.cli",
            "business-observation",
            "list",
            "--project-root",
            str(tmp_path),
            "--candidate-digest",
            CANDIDATE_A,
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    listed = json.loads(list_result.stdout)
    assert listed["pagination"]["total"] == 1
    assert listed["observations"][0]["observation_id"] == "cli-payload"


def test_float64_digest_matches_node_for_edge_numbers(tmp_path: Path):
    repository = Path(__file__).parents[3]
    values = [1.0, -0.0, 1e-7, 1e20, 0.74]
    python_digests = []
    observations = []
    for index, number in enumerate(values):
        value = observation(f"float-{index}", value=number if 0 <= number <= 1 else 0.5, segment=False)
        value["metrics"][0]["unit"] = "count"
        value["metrics"][0]["value"] = number
        observations.append(value)
        python_digests.append(business_observation_digest(value))
    script = """
import { businessObservationDigest } from './packages/dsh-plugin/lib/business-results.js'
const values = JSON.parse(process.argv[1])
console.log(JSON.stringify(values.map(businessObservationDigest)))
"""
    completed = subprocess.run(
        ["node", "--input-type=module", "--eval", script, json.dumps(observations)],
        cwd=repository,
        check=True,
        capture_output=True,
        text=True,
    )
    assert json.loads(completed.stdout) == python_digests
