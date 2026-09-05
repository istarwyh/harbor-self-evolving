"""Opt-in source-review fixture. Creates a unique isolated workspace, never runs a Job."""
from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

import yaml

from helpers import make_candidate, make_dataset, make_stack, make_context
from harbor_dsh_evolution.stack import snapshot_stack, snapshot_stack_sources


def main() -> None:
    parent = Path(sys.argv[1]).resolve(strict=True)
    root = Path(tempfile.mkdtemp(prefix="harbor-source-acceptance-", dir=parent))
    candidate = make_candidate(root)
    dataset = make_dataset(root)
    stack_path = make_stack(root)
    descriptor_path = root / "stack/evaluator/evaluator.json"
    descriptor = json.loads(descriptor_path.read_text())
    descriptor["editable_files"].append({"path": "rubric.md", "role": "rubric", "language": "markdown", "affects": ["evaluator", "rubric"]})
    descriptor_path.write_text(json.dumps(descriptor, indent=2) + "\n")
    (descriptor_path.parent / "rubric.md").write_text("# Citation rubric — synthetic acceptance only\n\nAward full credit when a citation is present.\nMissing citations receive no credit.\n")
    stack = yaml.safe_load(stack_path.read_text())
    stack["components"]["rubric"]["entry"] = "stack/evaluator/rubric.md"
    for component in stack["components"].values():
        component["entry"] = f"{root.name}/{component['entry']}"
    stack_path.write_text(yaml.safe_dump(stack, sort_keys=False))
    context = make_context(parent, candidate, dataset, stack_path, mode="diagnostic")
    manifest = snapshot_stack(stack_path, project_root=parent)
    job = parent / "jobs" / root.name
    job.mkdir(parents=True)
    artifacts = {
        "evaluation-summary.json": {"schema_version": 3, "synthetic_acceptance_fixture": True, "mode": "diagnostic", "metrics": {}, "n_trials": 0, "n_valid_scores": 0},
        "evaluation-stack-manifest.json": manifest,
        "evaluation-stack-sources.json": snapshot_stack_sources(manifest, project_root=parent),
        "evaluation-context.json": context,
        "evaluation-contract.json": manifest["evaluation_contract"],
    }
    for name, value in artifacts.items():
        (job / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"projectRoot": str(parent), "sourceDirectory": str(root), "job": job.name, "synthetic": True, "executedJobs": 0}))


if __name__ == "__main__":
    main()
