"""Opt-in one-task runner acceptance fixture; creates source data, never runs a Job.

The source Job is intentionally synthetic and prominently labelled. Only a
subsequent user-confirmed diagnostic Job exercises the real Candidate runtime.
No credentials, model calls, image pulls or Docker operations occur here.
"""
from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

from harbor_dsh_evolution.candidate import snapshot_candidate
from harbor_dsh_evolution.context import build_evaluation_context
from harbor_dsh_evolution.dataset import snapshot_dataset, build_dataset_preview
from harbor_dsh_evolution.quick import initialize_quick_diagnostic
from harbor_dsh_evolution.stack import snapshot_stack, snapshot_stack_sources


def main() -> None:
    parent = Path(sys.argv[1]).resolve(strict=True)
    source = Path(tempfile.mkdtemp(prefix="harbor-diagnostic-acceptance-", dir=parent))
    generated = initialize_quick_diagnostic(
        project_root=parent,
        workspace_subdir=source.name,
        query="Reply exactly HARBOR_DIAGNOSTIC_OK",
        rubric="Acceptance wiring only. Confirm one Candidate runs through the existing Host model broker. This is not a business-quality evaluation or promotion baseline.",
    )
    candidate_path = parent / generated["candidate_path"]
    binding = {"provider": "openai-codex", "model": "gpt-5.5", "transport": "dsh-host-broker", "protocol": "dsh-host-model-gateway/v1"}
    with (candidate_path / "model-binding.json").open("x") as output:
        output.write(json.dumps({"schema_version": 1, "source": "skill-agent-default", "provider": binding["provider"], "model": binding["model"]}, indent=2) + "\n")
    candidate = snapshot_candidate(candidate_path)
    dataset_path = parent / generated["dataset_path"]
    (dataset_path / "wiring-check" / "instruction.md").write_text("Reply exactly HARBOR_DIAGNOSTIC_OK\n")
    dataset = snapshot_dataset(dataset_path, dataset_id=generated["dataset_manifest"]["dataset_id"], version="1.0.0", dataset_kind="candidate-execution", metadata={"acceptance_fixture": True, "diagnostic_only": True})
    stack_path = parent / generated["stack_path"]
    context = build_evaluation_context(dataset_path, candidate=candidate, stack_path=stack_path, project_root=parent, mode="diagnostic", candidate_model_binding=binding)
    stack = snapshot_stack(stack_path, project_root=parent)
    job = source / "jobs" / "synthetic-source-not-executed"
    job.mkdir()
    trial_id = "synthetic-wiring-source-trial"
    score = {"value": None, "valid": False, "invalid_reasons": ["synthetic-source-not-executed"]}
    trial = {"id": trial_id, "name": "SYNTHETIC SOURCE — not executed", "datasetTrial": "wiring-check", "datasetOrder": 0, "attempt": 1, "status": "completed-unscored", "terminal": True, "score": score, "rewards": {}, "population": {"query": "Reply exactly HARBOR_DIAGNOSTIC_OK"}, "exception": None}
    artifacts = {
        "config.json": {"job_name": job.name, "jobs_dir": str(job.parent), "synthetic_acceptance_fixture": True, "agents": [{"import_path": "harbor_dsh_evolution.agent:DshCandidateAgent", "kwargs": {"candidate_path": str(candidate_path), "candidate_digest": candidate.digest, "candidate_version": candidate.version, "candidate_model_provider": binding["provider"], "candidate_model": binding["model"]}}], "datasets": [{"path": str(dataset_path)}]},
        "candidate-manifest.json": candidate.to_dict(),
        "dataset-manifest.json": dataset,
        "dataset-preview.json": build_dataset_preview(dataset_path, dataset),
        "evaluation-stack-manifest.json": stack,
        "evaluation-stack-sources.json": snapshot_stack_sources(stack, project_root=parent),
        "evaluation-context.json": context,
        "evaluation-contract.json": stack["evaluation_contract"],
        "trial-lifecycle.json": {"schema_version": 1, "job": job.name, "job_kind": "candidate-evaluation", "dataset_total": 1, "synthetic_acceptance_fixture": True, "trials": [{"dataset_order": 0, "dataset_trial": "wiring-check", "trial": "wiring-check", "execution_id": trial_id, "trial_name": trial["name"], "phase": "completed-unscored", "terminal": True, "attempt": 1, "score": score}]},
        "evaluation-summary.json": {"schema_version": 3, "job": job.name, "mode": "diagnostic", "synthetic_acceptance_fixture": True, "acceptance_warning": "Synthetic source fixture; zero Candidate executions. Only a separately confirmed diagnostic Job is real execution evidence.", "candidate": candidate.to_dict(), "evaluation_context": context, "n_trials": 1, "n_discovered_trials": 1, "n_completed_trials": 1, "n_valid_scores": 0, "n_invalid_scores": 1, "n_exceptions": 0, "status_counts": {"completed-unscored": 1}, "metrics": {}, "trials": [trial], "artifact_validation": {"valid": False, "findings": [{"level": "warning", "code": "SYNTHETIC_ACCEPTANCE_SOURCE", "message": "This source was not executed and is not quality evidence."}]}},
    }
    for name, value in artifacts.items():
        with (job / name).open("x") as output:
            output.write(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
    with (source / "ACCEPTANCE-ONLY.md").open("x") as output:
        output.write("# One-task diagnostic acceptance fixture\n\nThe source Job is synthetic and has never executed. It exists only to select one pinned task in the Workbench. A user-confirmed new diagnostic Job must execute the Candidate through the real Host broker and Docker before runtime acceptance may be claimed. Its quick verifier proves wiring only; it is not a business-quality test or a promotion baseline.\n")
    print(json.dumps({"projectRoot": str(parent), "workspaceRoot": source.name, "sourceDirectory": str(source), "job": job.name, "sourceJobDir": str(job), "trialId": trial_id, "candidatePath": generated["candidate_path"], "datasetPath": generated["dataset_path"], "stackPath": generated["stack_path"], "candidateModelBinding": binding, "syntheticSource": True, "executedJobs": 0}, ensure_ascii=False))


if __name__ == "__main__":
    main()
