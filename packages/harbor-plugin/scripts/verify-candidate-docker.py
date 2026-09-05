"""Internal driver for verify-candidate-docker.mjs; no provider credentials.

Runs the real Harbor DockerEnvironment and DshCandidateAgent lifecycle. The
Node parent owns the bounded, controlled production model Broker and authorizes
the first evaluation prompt only after checking that setup used zero requests.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import shutil
import sys
import uuid
from pathlib import Path

from harbor.environments.docker.docker import DockerEnvironment
from harbor.models.agent.context import AgentContext
from harbor.models.task.config import EnvironmentConfig
from harbor.models.trial.paths import TrialPaths
from harbor_dsh_evolution.agent import DshCandidateAgent
from harbor_dsh_evolution.candidate import snapshot_candidate, verify_candidate


def report(stage: str, **fields: object) -> None:
    print(json.dumps({"stage": stage, **fields}), flush=True)


async def docker(*args: str) -> str:
    process = await asyncio.create_subprocess_exec(
        "docker", *args, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
    )
    stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=30)
    if process.returncode:
        raise RuntimeError(f"Docker {args[0]} failed: {stderr.decode(errors='replace')}")
    return stdout.decode().strip()


async def verify(args: argparse.Namespace) -> None:
    root = Path(args.output).resolve(strict=True)
    source = Path(args.template).resolve(strict=True)
    candidate = root / "candidate"
    shutil.copytree(source, candidate, ignore=shutil.ignore_patterns("node_modules", ".harbor-runtime"))
    manifest = snapshot_candidate(candidate, candidate_id="harbor-keyless-docker-verification", version="1.0.0")
    assert manifest.runtime["transport"] == "acp"
    image_id = await docker("image", "inspect", args.image, "--format", "{{.Id}}")
    assert image_id.startswith("sha256:")
    session_id = "harbor-keyless-acp-" + uuid.uuid4().hex[:16]
    environment_dir = root / "environment"
    environment_dir.mkdir()
    paths = TrialPaths(root / "trial")
    paths.mkdir()
    paths.chmod_dir()
    environment = DockerEnvironment(
        environment_dir=environment_dir,
        environment_name=session_id,
        session_id=session_id,
        trial_paths=paths,
        task_env_config=EnvironmentConfig(docker_image=image_id, workdir="/workspace", cpus=1, memory_mb=2048),
        keep_containers=False,
        mounts=[
            {"type": "bind", "source": str(paths.agent_dir), "target": "/logs/agent"},
            {"type": "bind", "source": str(paths.verifier_dir), "target": "/logs/verifier"},
            {"type": "bind", "source": str(paths.artifacts_dir), "target": "/logs/artifacts"},
        ],
    )
    report("created", image_id=image_id, session_id=session_id, candidate_digest=manifest.digest)
    try:
        await asyncio.wait_for(environment.start(force_build=False), timeout=90)
        agent = DshCandidateAgent(
            logs_dir=paths.agent_dir,
            candidate_path=str(candidate),
            candidate_digest=manifest.digest,
            candidate_version=manifest.version,
            candidate_model_provider="controlled-fixture",
            candidate_model="controlled-model",
        )
        await asyncio.wait_for(agent.setup(environment), timeout=660)
        readiness = json.loads((paths.agent_dir / "candidate-runtime.json").read_text())
        assert readiness["candidate_digest"] == manifest.digest
        assert readiness["readiness"] == "initialize-and-session-new"
        assert readiness["preflight_model_requests"] == "disabled"
        report("setup_complete", readiness=readiness)
        permission = await asyncio.wait_for(asyncio.to_thread(sys.stdin.readline), timeout=15)
        if permission.strip() != "continue":
            raise RuntimeError("Parent did not authorize the controlled evaluation prompt")
        context = AgentContext()
        await asyncio.wait_for(
            agent.run("Reply exactly HARBOR_ACP_OK", environment, context), timeout=90
        )
        await environment.prepare_logs_for_host()
        agent.populate_context_post_run(context)
        assert context.metadata is not None
        identity = context.metadata["candidate"]
        assert identity["digest"] == manifest.digest
        assert identity["runtime"] == manifest.runtime
        assert context.metadata["acp"]["prompt_response"]["stopReason"] == "end_turn"
        trajectory_path = paths.agent_dir / "trajectory.json"
        trajectory = json.loads(trajectory_path.read_text())
        assert "HARBOR_ACP_OK" in json.dumps(trajectory)
        assert trajectory.get("steps"), "Real ACP events must produce an ATIF trajectory"
        launcher = (paths.agent_dir / "acp-launch.sh").read_text()
        assert "npx" not in launcher and "@latest" not in launcher
        assert f"/{manifest.runtime['entrypoint']}" in launcher
        assert context.metadata["acp"]["selected_distribution"] == "candidate-local"
        await environment.download_dir("/opt/harbor-dsh-candidate/.sessions", root / "candidate-sessions")
        events = [
            json.loads(line)
            for path in (root / "candidate-sessions").rglob("*.jsonl")
            for line in path.read_text().splitlines()
            if line.strip()
        ]
        assert any(event.get("type") == "assistant/message" and "HARBOR_ACP_OK" in json.dumps(event) for event in events)
        assert any(event.get("type") == "turn/end" and event["data"]["reason"]["kind"] == "completed" for event in events)
        verify_candidate(candidate, expected_digest=manifest.digest)
        report("run_complete", candidate=identity, trajectory_file=str(trajectory_path),
               atif_steps=len(trajectory["steps"]), persisted_events=len(events),
               selected_distribution="candidate-local", prompt_stop_reason="end_turn")
    finally:
        # delete=False still removes this exact Compose project's containers and
        # network, but never requests image deletion or touches another project.
        await asyncio.wait_for(environment.stop(delete=False), timeout=60)
        containers = await docker("ps", "-aq", "--filter", f"label=com.docker.compose.project={session_id}")
        networks = await docker("network", "ls", "-q", "--filter", f"label=com.docker.compose.project={session_id}")
        assert not containers, f"Owned verification containers remain for {session_id}"
        assert not networks, f"Owned verification networks remain for {session_id}"
        assert await docker("image", "inspect", image_id, "--format", "{{.Id}}") == image_id
        report("cleanup_complete", session_id=session_id, containers_remaining=0, networks_remaining=0, image_preserved=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--image", required=True)
    parser.add_argument("--template", required=True)
    parser.add_argument("--output", required=True)
    asyncio.run(verify(parser.parse_args()))
