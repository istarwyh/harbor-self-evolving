from __future__ import annotations

import logging
from pathlib import Path

import pytest

from harbor.models.task.config import EnvironmentConfig, NetworkMode, NetworkPolicy
from harbor.models.trial.paths import TrialPaths
from harbor_dsh_evolution.host_environment import HostEnvironment


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
        network_policy=NetworkPolicy(network_mode=NetworkMode.NO_NETWORK),
    )

    await environment.start(force_build=True)
    result = await environment.exec(
        'mkdir -p /logs/verifier && printf ready > /logs/verifier/reward.txt '
        '&& printf "%s" "$HARBOR_HOST_MODE"',
        user="root",
    )

    assert result.return_code == 0
    assert result.stdout == "1"
    assert (trial_paths.verifier_dir / "reward.txt").read_text() == "ready"
    assert environment.resolve_environment_path("/tests").is_dir()
    translated = environment._translate_command(
        "test -d /opt/harbor-dsh-candidate && test -d /opt/harbor-dsh"
    )
    assert translated.count(str(trial_paths.trial_dir / ".host-environment")) == 2

    await environment.stop(delete=True)
    assert (trial_paths.verifier_dir / "reward.txt").read_text() == "ready"
    assert not (trial_paths.trial_dir / ".host-environment").exists()


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
