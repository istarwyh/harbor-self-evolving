import json
from pathlib import Path

from harbor_dsh_evolution.summary import summarize_job


def test_summarize_job_aggregates_rewards_and_exceptions(tmp_path: Path):
    (tmp_path / "candidate-manifest.json").write_text(
        json.dumps({"candidate_id": "demo", "digest": "sha256:" + "0" * 64})
    )
    (tmp_path / "evaluation-context.json").write_text(
        json.dumps({"digest": "sha256:" + "c" * 64})
    )
    first = tmp_path / "trial-a"
    second = tmp_path / "trial-b"
    first.mkdir()
    second.mkdir()
    (first / "result.json").write_text(
        json.dumps(
            {
                "trial_name": "a",
                "agent_info": {"name": "demo"},
                "verifier_result": {"rewards": {"reward": 0.4, "search": 0}},
                "exception_info": None,
            }
        )
    )
    (second / "result.json").write_text(
        json.dumps(
            {
                "trial_name": "b",
                "agent_info": {"name": "demo"},
                "verifier_result": {"rewards": {"reward": 1.0, "search": 1}},
                "exception_info": {
                    "exception_type": "RuntimeError",
                    "exception_message": "example",
                },
            }
        )
    )

    summary = summarize_job(tmp_path)
    assert summary["n_trials"] == 2
    assert summary["n_exceptions"] == 1
    assert summary["metrics"] == {"reward": 0.7, "search": 0.5}
    assert summary["evaluation_context"]["digest"] == "sha256:" + "c" * 64
