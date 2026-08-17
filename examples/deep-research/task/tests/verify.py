import json
from pathlib import Path

result_path = Path("/app/research-result.json")
if not result_path.exists():
    metrics = {
        "task_completion": 0,
        "tool_call_success": 0,
        "search_validity": 0,
        "citation_correctness": 0,
        "reward": 0,
    }
else:
    result = json.loads(result_path.read_text())
    task_completion = int("refunds within 30 days" in result.get("answer", ""))
    tool_call_success = int(result.get("tool_errors") == 0)
    searches = result.get("searches") or []
    search_validity = int(
        bool(searches)
        and all(item.get("query", "").strip() and item.get("status") == "ok" for item in searches)
    )
    citations = result.get("citations") or []
    citation_correctness = int(
        bool(citations) and all(item.get("source_id") == "doc-1" for item in citations)
    )
    reward = (
        0.4 * task_completion
        + 0.2 * tool_call_success
        + 0.2 * search_validity
        + 0.2 * citation_correctness
    )
    metrics = {
        "task_completion": task_completion,
        "tool_call_success": tool_call_success,
        "search_validity": search_validity,
        "citation_correctness": citation_correctness,
        "reward": reward,
    }

Path("/logs/verifier/reward.json").write_text(json.dumps(metrics, separators=(",", ":")) + "\n")
print(json.dumps(metrics, indent=2))
