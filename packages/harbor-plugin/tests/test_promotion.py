from harbor_dsh_evolution.promotion import evaluate_promotion


POLICY = {
    "schema_version": 1,
    "primary_metric": "reward",
    "min_improvement": 0.1,
    "minimums": {"citation_correctness": 1.0},
    "non_regression": ["task_completion", "search_validity"],
}


def summary(job: str, **metrics):
    return {
        "job": job,
        "candidate": {
            "candidate_id": "business-agent",
            "digest": f"sha256:{job}",
        },
        "evaluation_context": {"digest": "sha256:" + "c" * 64},
        "n_exceptions": 0,
        "metrics": metrics,
    }


def test_promotes_improved_candidate():
    report = evaluate_promotion(
        summary("v1", reward=0.4, citation_correctness=0, task_completion=1, search_validity=0),
        summary("v2", reward=1, citation_correctness=1, task_completion=1, search_validity=1),
        POLICY,
    )
    assert report["decision"] == "PROMOTE"
    assert report["reasons"] == []


def test_rejects_primary_improvement_with_regression():
    report = evaluate_promotion(
        summary("v1", reward=0.4, citation_correctness=1, task_completion=1, search_validity=1),
        summary("v2", reward=0.8, citation_correctness=1, task_completion=0, search_validity=1),
        POLICY,
    )
    assert report["decision"] == "REJECT"
    assert any("task_completion regressed" in reason for reason in report["reasons"])


def test_rejects_incomparable_evaluation_contexts():
    baseline = summary("v1", reward=0.4, citation_correctness=1)
    candidate = summary("v2", reward=1.0, citation_correctness=1)
    candidate["evaluation_context"] = {"digest": "sha256:" + "d" * 64}
    report = evaluate_promotion(baseline, candidate, POLICY)
    assert report["decision"] == "REJECT"
    assert any("evaluation context mismatch" in reason for reason in report["reasons"])


def test_rejects_missing_evaluation_context():
    baseline = summary("v1", reward=0.4, citation_correctness=1)
    candidate = summary("v2", reward=1.0, citation_correctness=1)
    candidate["evaluation_context"] = None
    report = evaluate_promotion(baseline, candidate, POLICY)
    assert report["decision"] == "REJECT"
    assert "evaluation context digest is missing" in report["reasons"]


def test_rejects_unchanged_candidate_digest():
    baseline = summary("v1", reward=0.4, citation_correctness=1)
    candidate = summary("v2", reward=1.0, citation_correctness=1)
    candidate["candidate"]["digest"] = baseline["candidate"]["digest"]
    report = evaluate_promotion(baseline, candidate, POLICY)
    assert report["decision"] == "REJECT"
    assert "candidate digest is unchanged" in report["reasons"]


def test_rejects_a_different_candidate_product_line():
    baseline = summary("v1", reward=0.4, citation_correctness=1)
    candidate = summary("v2", reward=1.0, citation_correctness=1)
    candidate["candidate"]["candidate_id"] = "unrelated-agent"
    report = evaluate_promotion(baseline, candidate, POLICY)
    assert report["decision"] == "REJECT"
    assert any("product line mismatch" in reason for reason in report["reasons"])
