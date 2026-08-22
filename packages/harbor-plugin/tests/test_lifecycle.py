import json
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace

from harbor_dsh_evolution.lifecycle import TrialLifecycleStore


def event(task: str, execution: str, trial_name: str):
    result = SimpleNamespace(
        id=execution,
        trial_name=trial_name,
        exception_info=None,
        verifier_result=SimpleNamespace(rewards={"reward": 1}),
    )
    return SimpleNamespace(
        task_name=task,
        result=result,
        timestamp=datetime.now(UTC),
    )


def test_lifecycle_keeps_dataset_order_and_preserves_retry_attempts(tmp_path: Path):
    store = TrialLifecycleStore(
        tmp_path,
        job="job-1",
        tasks=[{"id": "query/a"}, {"id": "query/b"}],
    )
    store.initialize()
    first = event("query/a", "execution-a1", "trial-a1")
    store.transition(first, "preparing-environment")
    store.transition(first, "running-agent")
    store.transition(first, "completed", terminal=True)
    store.finalize_score(
        "execution-a1",
        phase="candidate-quality-failed",
        score={"value": None, "valid": False, "invalid_reasons": ["requirement-failed:renderer_valid"]},
    )
    second = event("query/b", "execution-b1", "trial-b1")
    store.transition(second, "completed", terminal=True)
    retry = event("query/a", "execution-a2", "trial-a2")
    store.transition(retry, "preparing-environment")

    snapshot = json.loads((tmp_path / "trial-lifecycle.json").read_text())
    assert snapshot["dataset_total"] == 2
    assert snapshot["attempt_count"] == 3
    assert [(item["dataset_order"], item["attempt"]) for item in snapshot["trials"]] == [
        (0, 1),
        (0, 2),
        (1, 1),
    ]
    assert snapshot["trials"][0]["phase"] == "candidate-quality-failed"
    events = [json.loads(line) for line in (tmp_path / "trial-events.jsonl").read_text().splitlines()]
    assert events[0]["phase"] == "queued"
    assert any(item["attempt"] == 2 for item in events)
    assert all("exception" not in item for item in events)


def test_lifecycle_matches_harbor_task_names_without_using_callback_order(tmp_path: Path):
    store = TrialLifecycleStore(
        tmp_path,
        job="parallel-job",
        tasks=[
            {"id": "01-color", "path": "01-color"},
            {"id": "10-scientific-method", "path": "10-scientific-method"},
        ],
    )
    store.initialize()

    # Parallel Harbor callbacks may complete in any order and include a suite prefix.
    scientific = event("concepts/10-scientific-method", "execution-science", "random-science")
    color = event("concepts/01-color", "execution-color", "random-color")
    store.transition(scientific, "completed", terminal=True)
    store.transition(color, "completed", terminal=True)

    snapshot = json.loads((tmp_path / "trial-lifecycle.json").read_text())
    assert [item["dataset_trial"] for item in snapshot["trials"]] == [
        "01-color",
        "10-scientific-method",
    ]
    assert [item["trial_name"] for item in snapshot["trials"]] == [
        "random-color",
        "random-science",
    ]
    assert all("_task_aliases" not in item for item in snapshot["trials"])


def test_lifecycle_never_assigns_an_unknown_harbor_task_to_an_unrelated_dataset_item(tmp_path: Path):
    store = TrialLifecycleStore(
        tmp_path,
        job="unknown-task-job",
        tasks=[{"id": "known-a"}, {"id": "known-b"}],
    )
    store.initialize()
    store.transition(event("suite/unexpected", "execution-x", "random-x"), "completed", terminal=True)

    snapshot = json.loads((tmp_path / "trial-lifecycle.json").read_text())
    assert snapshot["dataset_total"] == 3
    assert [item["phase"] for item in snapshot["trials"][:2]] == ["queued", "queued"]
    assert snapshot["trials"][2]["dataset_trial"] == "suite/unexpected"
    assert snapshot["trials"][2]["execution_id"] == "execution-x"
