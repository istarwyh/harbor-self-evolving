import json
from pathlib import Path

from jsonschema import Draft202012Validator

from helpers import make_candidate, make_context, make_dataset, make_stack


SCHEMA_ROOT = Path(__file__).parents[3] / "schemas"


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
