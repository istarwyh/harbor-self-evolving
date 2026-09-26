import json
import sys
from pathlib import Path

sys.path.insert(0, "/tests")
from evaluator import evaluate

result_path = Path("/app/research-result.json")
result = json.loads(result_path.read_text()) if result_path.exists() else {}
task = json.loads(Path("/app/task-spec.json").read_text())
catalog = json.loads(Path("/app/source-catalog.json").read_text())
assessment = evaluate(
    {
        "schema_version": 2,
        "protocol": "evaluation-input/v2",
        "task": task,
        "candidate_output": result,
        "evidence": catalog,
    }
)
for item in assessment.get("criteria") or []:
    if not str(item.get("reason") or "").strip():
        raise ValueError(f"Evaluator criterion {item.get('id')} requires a reason")
    if not str(item.get("recommendation") or "").strip():
        raise ValueError(f"Evaluator criterion {item.get('id')} requires a recommendation")
criteria = {item["id"]: item["score"] for item in assessment["criteria"]}
if set(criteria.values()) - {0, 0.5, 1}:
    raise ValueError("Evaluator criteria must be 0, 0.5, or 1")
coverage = assessment["aggregate"]["coverage"]
Path("/logs/verifier/evaluation-result.json").write_text(json.dumps(assessment, ensure_ascii=False, indent=2) + "\n")
Path("/logs/verifier/reward.json").write_text(json.dumps({"criterion_coverage": coverage}, separators=(",", ":")) + "\n")
print(json.dumps({"criterion_coverage": coverage, "assessment": assessment}, ensure_ascii=False, indent=2))
