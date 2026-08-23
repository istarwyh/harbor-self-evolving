from __future__ import annotations

from pathlib import Path

import json

import yaml

from harbor_dsh_evolution.candidate import snapshot_candidate
from harbor_dsh_evolution.context import build_evaluation_context
from harbor_dsh_evolution.dataset import snapshot_dataset


MODEL_BINDING = {
    "provider": "openai-codex",
    "model": "gpt-test",
    "reasoning_effort": "high",
    "transport": "dsh-host-broker",
    "protocol": "dsh-host-model-gateway/v1",
}


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
        if role == "evaluator":
            entry = "stack/evaluator/evaluator.json"
        else:
            suffix = "md" if role == "rubric" else "py"
            entry = f"stack/{role}.{suffix}"
        path = root / entry
        path.parent.mkdir(parents=True, exist_ok=True)
        if role == "evaluator":
            (path.parent / "evaluator.py").write_text(
                "def evaluate(payload):\n    return {'schema_version': 1, 'protocol': 'evaluation-result/v1', 'criteria': [{'id': 'citation_accuracy', 'score': 1, 'reason': 'The citation is valid.', 'recommendation': 'Preserve this behavior.'}]}\n"
            )
            path.write_text(
                json.dumps(
                    {
                        "schema_version": 1,
                        "interface": "harbor-dsh-evaluator/v1",
                        "evaluator_id": "search-evaluator",
                        "version": version,
                        "kind": "script",
                        "protocol": {"input": "evaluation-input/v1", "output": "evaluation-result/v1"},
                        "implementation": {"entry": "evaluator.py", "language": "python", "callable": "evaluate"},
                        "editable_files": [
                            {"path": "evaluator.py", "role": "implementation", "language": "python", "affects": ["evaluator"]},
                        ],
                        "criteria": [{"id": "citation_accuracy", "label": "Citation accuracy", "values": [0, 0.5, 1]}],
                        "aggregate": {"metric_id": "reward", "method": "mean"},
                    },
                    indent=2,
                )
                + "\n"
            )
        else:
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
            "hard_requirements": [
                {"id": "input_integrity"},
                {"id": "agent_completed"},
                {"id": "integration_valid"},
                {"id": "renderer_valid"},
                {"id": "judge_completed"},
                {"id": "artifact_schema_valid"},
            ],
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
        candidate_model_binding=MODEL_BINDING,
    )
