from __future__ import annotations

from pathlib import Path

import json

import yaml

from harbor_dsh_evolution.candidate import snapshot_candidate
from harbor_dsh_evolution.context import build_evaluation_context
from harbor_dsh_evolution.dataset import snapshot_dataset
from harbor_dsh_evolution.identity import canonical_digest
from harbor_dsh_evolution.session_batch import (
    generation_batch_digest,
    observation_digest,
)


MODEL_BINDING = {
    "provider": "openai-codex",
    "model": "gpt-test",
    "reasoning_effort": "high",
    "transport": "dsh-host-broker",
    "protocol": "dsh-host-model-gateway/v1",
}

HISTORICAL_JUDGE_BINDING = {
    "judge_provider": "judge-provider",
    "judge_model": "judge-model",
    "judge_reasoning_effort": "high",
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
    task = dataset / "search-task"
    (task / "environment").mkdir(parents=True)
    (task / "tests").mkdir()
    (task / "task.toml").write_text(
        'schema_version = "1.4"\n\n[task]\nname = "examples/vertical-search"\nversion = "1.0.0"\n'
    )
    (task / "instruction.md").write_text("Find the requested source and cite it.\n")
    (task / "environment" / "Dockerfile").write_text("FROM alpine:3.22\n")
    (task / "tests" / "test.sh").write_text(
        "#!/bin/sh\nset -eu\nmkdir -p /logs/verifier\n"
        "printf '{\"reward\":1}' > /logs/verifier/reward.json\n"
        "printf '{\"schema_version\":1,\"protocol\":\"evaluation-result/v1\",\"criteria\":[{\"id\":\"citation_accuracy\",\"score\":1,\"reason\":\"Citation is valid.\",\"recommendation\":\"Preserve this behavior.\"}]}' > /logs/verifier/evaluation-result.json\n"
    )
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


def make_historical_batch(root: Path, *, count: int = 1):
    batch_root = root / ".harbor" / "private" / "session-batches" / "batch-test"
    sessions = batch_root / "sessions"
    sessions.mkdir(parents=True)
    policy = {
        "id": "dsh-session-default-redaction",
        "version": "1.0.0",
        "projection": "direct-human-and-assembled-assistant-text",
        "tool_payloads": "omit",
        "reasoning": "omit",
        "attachments": "omit",
        "credentials": "redact-and-fail-closed",
    }
    policy["digest"] = canonical_digest(
        policy, namespace="harbor-dsh-session-redaction-policy-v1"
    )
    records = []
    observations = {}
    for index in range(1, count + 1):
        trial_id = f"session-{index:04d}"
        source_ref = canonical_digest(
            {"trial": trial_id}, namespace="test-historical-source-ref"
        )
        source_digest = canonical_digest(
            {"events": index}, namespace="test-historical-source"
        )
        observation = {
            "schema_version": 1,
            "protocol": "dsh-session-observation/v1",
            "record_kind": "dsh-session",
            "execution_mode": "observe-existing",
            "trial_id": trial_id,
            "source": {
                "ref": source_ref,
                "captured_through_seq": 2,
                "source_digest": source_digest,
                "created_at": "2026-08-30T00:00:00Z",
                "last_activity_at": f"2026-08-30T00:00:{index:02d}Z",
                "last_turn_reason": "completed",
                "session_format_version": 1,
            },
            "generator": {
                "agent_preset": "default",
                "model_segments": [{"provider": "test", "model": "generator"}],
            },
            "task": {
                "title": f"Historical task {index}",
                "initial_user_goal": f"Complete historical task {index}",
                "turn_count": 1,
            },
            "visible_transcript": [
                {
                    "event_seq": 1,
                    "message_ref": canonical_digest(
                        {"id": f"user-{index}"},
                        namespace="harbor-dsh-session-message-ref-v1",
                    ),
                    "role": "user",
                    "content": [{"type": "text", "text": f"Complete task {index}"}],
                    "time": "2026-08-30T00:00:00Z",
                },
                {
                    "event_seq": 2,
                    "message_ref": canonical_digest(
                        {"id": f"assistant-{index}"},
                        namespace="harbor-dsh-session-message-ref-v1",
                    ),
                    "role": "assistant",
                    "content": [{"type": "text", "text": f"Completed task {index}"}],
                    "time": f"2026-08-30T00:00:{index:02d}Z",
                },
            ],
            "execution": {"tools": [], "turns": [], "usage": {}},
            "feedback": {"items": []},
            "completeness": {
                "transcript_complete": True,
                "tool_payloads_complete": False,
                "attachments_complete": False,
                "truncations": [],
            },
            "redaction": {"replacements": 0, "truncations": 0, "omitted_blocks": 0},
        }
        observation["digest"] = observation_digest(observation)
        relative = f"sessions/{trial_id}.json"
        (batch_root / relative).write_text(
            json.dumps(observation, ensure_ascii=False, indent=2) + "\n"
        )
        observations[trial_id] = observation
        records.append(
            {
                "trial_id": trial_id,
                "record_kind": "dsh-session",
                "source_ref": source_ref,
                "captured_through_seq": 2,
                "source_digest": source_digest,
                "observation_digest": observation["digest"],
                "last_activity_at": observation["source"]["last_activity_at"],
                "generator": {
                    "agent_preset": "default",
                    "model_routes": [{"provider": "test", "model": "generator"}],
                    "homogeneous": True,
                },
                "observation_path": relative,
            }
        )
    batch = {
        "schema_version": 1,
        "protocol": "historical-generation-batch/v1",
        "batch_id": "batch-test",
        "created_at": "2026-08-30T00:01:00Z",
        "project": {
            "cwd_digest": canonical_digest(
                {"cwd": str(root.resolve())}, namespace="harbor-dsh-project-cwd-v1"
            )
        },
        "selection": {
            "scope": "exact-cwd",
            "order": "last-activity-desc",
            "requested_limit": count,
            "selected_count": count,
            "current_session_excluded": True,
        },
        "source": {
            "kind": "dsh-session",
            "adapter": "dsh-session-query",
            "session_format_versions": [1],
        },
        "redaction_policy": policy,
        "records": records,
        "generator_population": {
            "homogeneous": True,
            "agent_presets": ["default"],
            "model_routes": ["test/generator"],
        },
    }
    batch["digest"] = generation_batch_digest(batch)
    path = batch_root / "historical-generation-batch.json"
    path.write_text(json.dumps(batch, ensure_ascii=False, indent=2) + "\n")
    return path, batch, observations
