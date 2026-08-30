import json
from pathlib import Path

from jsonschema import Draft202012Validator

from helpers import make_candidate, make_context, make_dataset, make_stack
from helpers import make_historical_batch
from harbor_dsh_evolution.historical_context import build_historical_context
from harbor_dsh_evolution.historical_summary import summarize_historical_payloads
from harbor_dsh_evolution.session_batch import materialize_historical_dataset


SCHEMA_ROOT = Path(__file__).parents[3] / "schemas"
DSH_SCHEMA_ROOT = SCHEMA_ROOT.parent / "packages" / "dsh-plugin" / "schemas"
HISTORICAL_SCHEMAS = (
    "historical-generation-batch.schema.json",
    "dsh-session-observation.schema.json",
    "historical-evaluation-context.schema.json",
    "evaluation-result-v2.schema.json",
    "historical-evaluation-summary.schema.json",
)


def load(name: str):
    return json.loads((SCHEMA_ROOT / name).read_text())


def test_all_public_schemas_are_valid_json_schema():
    for path in SCHEMA_ROOT.glob("*.schema.json"):
        Draft202012Validator.check_schema(json.loads(path.read_text()))


def test_generated_context_and_dataset_match_public_schemas(tmp_path: Path):
    candidate = make_candidate(tmp_path)
    dataset = make_dataset(tmp_path)
    stack = make_stack(tmp_path)
    context = make_context(tmp_path, candidate, dataset, stack)
    Draft202012Validator(load("evaluation-context.schema.json")).validate(context)
    Draft202012Validator(load("dataset-manifest.schema.json")).validate(
        json.loads((dataset / "dataset-manifest.json").read_text())
    )


def test_historical_runtime_artifacts_match_public_schemas(tmp_path: Path):
    batch_path, batch, observations = make_historical_batch(tmp_path, count=2)
    Draft202012Validator(load("historical-generation-batch.schema.json")).validate(
        batch
    )
    observation_validator = Draft202012Validator(
        load("dsh-session-observation.schema.json")
    )
    for observation in observations.values():
        observation_validator.validate(observation)

    materialized = materialize_historical_dataset(
        project_root=tmp_path,
        batch_path=batch_path,
        output_path=tmp_path / "materialized" / "dataset",
        judge_provider="judge-provider",
        judge_model="judge-model",
        judge_reasoning_effort="high",
    )
    context = build_historical_context(
        project_root=tmp_path,
        batch_path=batch_path,
        dataset_path=Path(materialized["dataset_path"]),
        stack_path=Path(materialized["stack_path"]),
    )
    Draft202012Validator(load("historical-evaluation-context.schema.json")).validate(
        context
    )
    evaluator_result = {
        "schema_version": 2,
        "protocol": "evaluation-result/v2",
        "criteria": [
            {
                "id": "goal_progress",
                "status": "insufficient-evidence",
                "score": None,
                "reason": "The frozen evidence is intentionally incomplete.",
                "recommendation": "Collect a new complete record.",
                "evidence_refs": ["generation_record.completeness"],
            }
        ],
        "aggregate": {
            "metric_id": "reward",
            "value": None,
            "scored_criteria": 0,
            "total_criteria": 1,
            "coverage": 0,
        },
    }
    Draft202012Validator(load("evaluation-result-v2.schema.json")).validate(
        evaluator_result
    )
    summary = summarize_historical_payloads(
        [],
        job_name="historical-schema-test",
        evaluation_context=context,
        artifact_validation={"valid": True, "findings": []},
        dataset_manifest=materialized["dataset_manifest"],
        assessments=[],
    )
    Draft202012Validator(load("historical-evaluation-summary.schema.json")).validate(
        summary
    )
    Draft202012Validator(load("evaluation-summary.schema.json")).validate(summary)


def test_dsh_package_exports_exact_public_historical_schemas():
    for name in HISTORICAL_SCHEMAS:
        assert json.loads((DSH_SCHEMA_ROOT / name).read_text()) == load(name)
