from __future__ import annotations

import hashlib
import json
import logging
from pathlib import Path

import pytest

from harbor.models.agent.context import AgentContext
from harbor.models.task.config import EnvironmentConfig, NetworkMode, NetworkPolicy
from harbor.models.trial.paths import TrialPaths
from harbor_dsh_evolution.host_environment import HostEnvironment
from harbor_dsh_evolution.session_agent import SessionObservationAgent


@pytest.mark.asyncio
async def test_host_environment_maps_harbor_paths_and_preserves_mounted_logs(
    tmp_path: Path,
) -> None:
    trial_paths = TrialPaths(tmp_path / "trial")
    trial_paths.mkdir()
    environment_dir = tmp_path / "task" / "environment"
    environment_dir.mkdir(parents=True)
    environment = HostEnvironment(
        environment_dir=environment_dir,
        environment_name="host-test",
        session_id="host-test__env",
        trial_paths=trial_paths,
        task_env_config=EnvironmentConfig(),
        logger=logging.getLogger("host-test"),
        mounts=[
            {"type": "bind", "source": str(trial_paths.agent_dir), "target": "/logs/agent"},
            {"type": "bind", "source": str(trial_paths.verifier_dir), "target": "/logs/verifier"},
            {"type": "bind", "source": str(trial_paths.artifacts_dir), "target": "/logs/artifacts"},
        ],
        network_policy=NetworkPolicy(network_mode=NetworkMode.PUBLIC),
    )

    await environment.start(force_build=True)
    result = await environment.exec(
        'mkdir -p /logs/verifier && printf ready > /logs/verifier/reward.txt '
        '&& printf "%s" "$HARBOR_HOST_MODE"',
        user="root",
    )

    assert result.return_code == 0
    assert result.stdout == "1"
    task_root = await environment.exec('printf "%s" "$HSE_TASK_ROOT"', user="root")
    assert task_root.stdout == str(environment.resolve_environment_path("/workspace"))
    assert (trial_paths.verifier_dir / "reward.txt").read_text() == "ready"
    assert environment.resolve_environment_path("/tests").is_dir()
    translated = environment._translate_command(
        "test -d /opt/harbor-dsh-candidate && test -d /opt/harbor-dsh"
    )
    assert translated.count(str(trial_paths.trial_dir / ".host-environment")) == 2
    observation = environment.resolve_environment_path(
        "/opt/harbor-dsh/session-observation.json"
    )
    assert environment._translate_command(f"cat {observation}") == f"cat {observation}"

    await environment.stop(delete=True)
    assert (trial_paths.verifier_dir / "reward.txt").read_text() == "ready"
    assert not (trial_paths.trial_dir / ".host-environment").exists()


@pytest.mark.asyncio
async def test_host_environment_runs_session_observation_adapter(tmp_path: Path) -> None:
    trial_paths = TrialPaths(tmp_path / "trial")
    trial_paths.mkdir()
    environment_dir = tmp_path / "task" / "environment"
    environment_dir.mkdir(parents=True)
    unsigned = {
        "protocol": "dsh-session-observation/v1",
        "visible_transcript": [],
    }
    canonical = json.dumps(
        unsigned, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode()
    digest = "sha256:" + hashlib.sha256(
        b"harbor-dsh-session-observation-v1\0" + canonical
    ).hexdigest()
    (environment_dir / "session-observation.json").write_text(
        json.dumps({**unsigned, "digest": digest})
    )
    environment = HostEnvironment(
        environment_dir=environment_dir,
        environment_name="host-session",
        session_id="host-session__env",
        trial_paths=trial_paths,
        task_env_config=EnvironmentConfig(),
    )
    await environment.start(force_build=False)
    agent = SessionObservationAgent(logs_dir=tmp_path)
    context = AgentContext()

    await agent.setup(environment)
    await agent.run("ignored", environment, context)

    artifact = environment.resolve_environment_path(agent.ARTIFACT_PATH)
    assert json.loads(artifact.read_text())["digest"] == digest
    assert context.metadata["observation"]["digest"] == digest
    await environment.stop(delete=True)


@pytest.mark.asyncio
async def test_host_environment_upload_download_and_timeout(tmp_path: Path) -> None:
    trial_paths = TrialPaths(tmp_path / "trial")
    trial_paths.mkdir()
    environment_dir = tmp_path / "environment"
    environment_dir.mkdir()
    environment = HostEnvironment(
        environment_dir=environment_dir,
        environment_name="host-files",
        session_id="host-files__env",
        trial_paths=trial_paths,
        task_env_config=EnvironmentConfig(),
    )
    await environment.start(force_build=False)
    source = tmp_path / "source.txt"
    source.write_text("host-file")
    await environment.upload_file(source, "/tests/source.txt")
    checked = await environment.exec("test -f /tests/source.txt && cat /tests/source.txt")
    assert checked.return_code == 0
    assert checked.stdout == "host-file"

    downloaded = tmp_path / "downloaded.txt"
    await environment.download_file("/tests/source.txt", downloaded)
    assert downloaded.read_text() == "host-file"

    timed_out = await environment.exec("sleep 5", timeout_sec=0.01)
    assert timed_out.return_code == 124
    await environment.stop(delete=True)
