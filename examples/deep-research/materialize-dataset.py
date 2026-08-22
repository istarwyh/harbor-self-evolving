#!/usr/bin/env python3
"""Materialize the declarative 13-Task Dataset and shared Evaluator adapter."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATASET_ROOT = ROOT / "task"
SPEC_PATH = ROOT / "dataset-spec.json"
DEFAULT_EVALUATOR_PATH = ROOT / "stack" / "evaluator" / "evaluator.py"

DOCKERFILE = """FROM redis@sha256:8b81dd37ff027bec4e516d41acfbe9fe2460070dc6d4a4570a2ac5b9d59df065

RUN apk add --no-cache \\
      bash \\
      ca-certificates \\
      coreutils \\
      curl \\
      nodejs \\
      npm \\
      py3-pip \\
      py3-virtualenv \\
      python3 \\
    && python3 -m venv /opt/harbor-acp-venv \\
    && /opt/harbor-acp-venv/bin/pip install --no-cache-dir agent-client-protocol

WORKDIR /app

COPY source-catalog.json /app/source-catalog.json
COPY task-spec.json /app/task-spec.json
"""

TEST_SH = """#!/bin/bash

set -eu

mkdir -p /logs/verifier
python3 /tests/verify.py
"""

VERIFY_PY = '''import json
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
        "schema_version": 1,
        "protocol": "evaluation-input/v1",
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
metrics = {**criteria, "reward": round(sum(criteria.values()) / len(criteria), 6)}
Path("/logs/verifier/evaluation-result.json").write_text(json.dumps(assessment, ensure_ascii=False, indent=2) + "\\n")
Path("/logs/verifier/reward.json").write_text(json.dumps(metrics, separators=(",", ":")) + "\\n")
print(json.dumps({"metrics": metrics, "assessment": assessment}, ensure_ascii=False, indent=2))
'''


def instruction(task: dict) -> str:
    return f"""# 任务

请用中文回答这个问题：**{task['question']}**

你的回答应当：

1. 直接回应问题，并解释关键概念；
2. 尽量用一个例子、类比或反直觉细节帮助普通读者理解；
3. 先检索 Task 提供的 Source Catalog，再只引用实际检索到的 source id；
4. 将最终业务产物写入 `research-report.md` 与 `research-result.json`。

评测器从「回应问题」「有趣性」「引用规范性」三个维度评分，每项只取 `0`、`0.5`、`1`。
"""


def task_toml(task: dict, version: str) -> str:
    question = json.dumps(task["question"], ensure_ascii=False)
    topic = json.dumps(task["topic"], ensure_ascii=False)
    return f'''schema_version = "1.4"
artifacts = ["/app/research-report.md", "/app/research-result.json"]

[task]
name = "concepts/{task['id']}"
version = "{version}"
description = "Chinese concept explanation with grounded retrieval and ternary evaluation."
authors = []
keywords = ["deep-research", "concept-explanation", "citations"]

[metadata]
query = {question}
topic = {topic}
case_type = {json.dumps((task.get("badcase") or {}).get("kind", "standard"), ensure_ascii=False)}
badcase = {str(bool(task.get("badcase"))).lower()}

[verifier]
timeout_sec = 120.0
collect = []

[verifier.env]

[agent]
timeout_sec = 1200.0

[environment]
network_mode = "public"
build_timeout_sec = 600.0
os = "linux"
mcp_servers = []

[environment.env]

[solution.env]
'''


def generated_files(spec: dict, evaluator_path: Path) -> dict[Path, str]:
    evaluator = evaluator_path.expanduser().resolve(strict=True).read_text()
    files: dict[Path, str] = {}
    for task in spec["tasks"]:
        root = DATASET_ROOT / task["id"]
        task_spec = {
            "schema_version": 1,
            "id": task["id"],
            "topic": task["topic"],
            "question": task["question"],
            "answer_concepts": task["answer_concepts"],
            "expected_source_id": task["source"]["id"],
            "badcase": task.get("badcase"),
        }
        files[root / "instruction.md"] = instruction(task)
        files[root / "task.toml"] = task_toml(task, spec["version"])
        files[root / "environment" / "Dockerfile"] = DOCKERFILE
        files[root / "environment" / "source-catalog.json"] = json.dumps(
            {"schema_version": 1, "sources": [task["source"]]}, ensure_ascii=False, indent=2
        ) + "\n"
        files[root / "environment" / "task-spec.json"] = json.dumps(task_spec, ensure_ascii=False, indent=2) + "\n"
        files[root / "tests" / "test.sh"] = TEST_SH
        files[root / "tests" / "verify.py"] = VERIFY_PY
        files[root / "tests" / "evaluator.py"] = evaluator
    return files


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--evaluator", type=Path, default=DEFAULT_EVALUATOR_PATH)
    args = parser.parse_args()
    spec = json.loads(SPEC_PATH.read_text())
    if spec.get("schema_version") != 1 or len(spec.get("tasks") or []) != 13:
        raise ValueError("dataset-spec.json must contain exactly 13 v1 tasks")
    expected = generated_files(spec, args.evaluator)
    stale = [path for path, content in expected.items() if not path.is_file() or path.read_text() != content]
    legacy = [DATASET_ROOT / name for name in ("task.toml", "instruction.md") if (DATASET_ROOT / name).exists()]
    if args.check:
        if stale or legacy:
            for path in [*stale, *legacy]:
                print(path.relative_to(ROOT))
            return 1
        print(f"Dataset materialization is current: {len(spec['tasks'])} tasks")
        return 0
    for path, content in expected.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)
        if path.name == "test.sh":
            os.chmod(path, 0o755)
    print(f"Materialized {len(spec['tasks'])} tasks into {DATASET_ROOT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
