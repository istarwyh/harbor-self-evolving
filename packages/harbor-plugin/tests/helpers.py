from __future__ import annotations

from pathlib import Path

import yaml

from harbor_dsh_evolution.candidate import snapshot_candidate
from harbor_dsh_evolution.context import build_evaluation_context
from harbor_dsh_evolution.dataset import snapshot_dataset


def make_candidate(root: Path, *, version: str = "1.0.0", content: str = "v1") -> Path:
    candidate = root / f"candidate-{version}"
    candidate.mkdir()
    (candidate / "cordis.yml").write_text("- name: example\n")
    (candidate / "package.json").write_text(f'{{"name":"business-agent","version":"{version}"}}\n')
    (candidate / "package-lock.json").write_text(
        f'{{"name":"business-agent","version":"{version}","lockfileVersion":3}}\n'
    )
    (candidate / "plugin.mjs").write_text(f"export default {content!r}\n")
    snapshot_candidate(candidate)
    return candidate


def make_dataset(root: Path, *, version: str = "1.0.0") -> Path:
    dataset = root / "dataset"
    (dataset / "environment").mkdir(parents=True)
    (dataset / "tests").mkdir()
    (dataset / "task.toml").write_text('[task]\nname = "vertical-search"\nversion = "1.0.0"\n')
    (dataset / "instruction.md").write_text("Find the requested source and cite it.\n")
    (dataset / "environment" / "Dockerfile").write_text("FROM alpine:3.22\n")
    (dataset / "tests" / "verify.py").write_text("print('ok')\n")
    snapshot_dataset(dataset, dataset_id="vertical-search", version=version)
    return dataset


def make_stack(root: Path, *, version: str = "1.0.0", runner_semantic: bool = False) -> Path:
    roles = ("integration", "renderer", "evaluator", "rubric", "diagnoser", "optimizer", "runner", "reporter")
    components = {}
    for role in roles:
        suffix = "md" if role == "rubric" else "py"
        entry = f"stack/{role}.{suffix}"
        path = root / entry
        path.parent.mkdir(exist_ok=True)
        path.write_text(f"# {role}\nROLE = {role!r}\n")
        components[role] = {"id": f"search-{role}", "version": version, "entry": entry}
    components["runner"]["semantic"] = runner_semantic
    stack = {
        "schema_version": 1,
        "stack_id": "vertical-search-stack",
        "version": version,
        "components": components,
        "judge": {"provider": "local", "model": "judge", "version": "1.0.0", "parameters": {"temperature": 0}},
        "evaluation_contract": {
            "contract_id": "vertical-search-contract",
            "version": "1.0.0",
            "primary_metric": "reward",
            "metrics": [
                {"id": "reward", "direction": "maximize"},
                {"id": "citation_accuracy", "direction": "maximize"},
            ],
            "groups": [],
            "hard_requirements": [],
        },
    }
    output = root / ".harbor" / "evaluation-stack.yml"
    output.parent.mkdir()
    output.write_text(yaml.safe_dump(stack, sort_keys=False))
    return output


def make_context(root: Path, candidate: Path, dataset: Path, stack: Path, *, mode: str = "promotion-eligible"):
    from harbor_dsh_evolution.candidate import load_manifest

    return build_evaluation_context(
        dataset,
        candidate=load_manifest(candidate),
        stack_path=stack,
        project_root=root,
        mode=mode,
    )
