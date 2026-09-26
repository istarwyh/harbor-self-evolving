from __future__ import annotations

import json
from pathlib import Path

import yaml

from harbor_dsh_evolution.evaluator import (
    inspect_evaluator,
    inspect_evaluator_bundle,
    snapshot_evaluator_bundle,
    update_evaluator_source,
)
from helpers import make_stack


def test_old_job_bundle_can_fork_a_new_evaluator_after_live_stack_advances(tmp_path: Path):
    stack_path = make_stack(tmp_path)
    original = inspect_evaluator(project_root=tmp_path, stack_path=stack_path)
    descriptor = tmp_path / original["evaluator"]["descriptor_path"]
    bundle = tmp_path / "jobs" / "baseline" / "evaluator-bundle"
    bundle.parent.mkdir(parents=True)
    snapshot_evaluator_bundle(descriptor, project_root=tmp_path, destination=bundle)
    saved = inspect_evaluator_bundle(project_root=tmp_path, bundle_path=bundle)
    original_source = saved["evaluator"]["editable_files"][0]

    live_source = original["evaluator"]["editable_files"][0]
    update_evaluator_source(
        project_root=tmp_path,
        stack_path=stack_path,
        file_path=live_source["path"],
        content=live_source["text"] + "\n# live-only change\n",
        expected_digest=live_source["digest"],
        new_evaluator_version="1.1.0",
        new_stack_version="1.1.0",
    )
    # Simulate replacing the live Evaluator family after the source Job ran.
    live_stack = yaml.safe_load(stack_path.read_text())
    live_descriptor_path = tmp_path / live_stack["components"]["evaluator"]["entry"]
    live_descriptor = json.loads(live_descriptor_path.read_text())
    live_descriptor["evaluator_id"] = "replacement-family"
    live_descriptor_path.write_text(json.dumps(live_descriptor))
    live_stack["components"]["evaluator"]["id"] = "replacement-family"
    stack_path.write_text(yaml.safe_dump(live_stack, sort_keys=False))

    forked = update_evaluator_source(
        project_root=tmp_path,
        stack_path=stack_path,
        source_bundle_path=bundle,
        file_path=original_source["path"],
        content=original_source["text"] + "\n# forked from executed baseline\n",
        expected_digest=original_source["digest"],
        new_evaluator_version="2.0.0",
        new_stack_version="2.0.0",
    )

    text = (tmp_path / forked["evaluator"]["implementation"]["path"]).read_text()
    assert "forked from executed baseline" in text
    assert "live-only change" not in text
    assert forked["evaluator"]["evaluator_id"] == original["evaluator"]["evaluator_id"]
    assert forked["evaluator"]["version"] == "2.0.0"
    assert forked["evaluator"]["bundle_complete"] is True
