from __future__ import annotations

import json
import subprocess
from pathlib import Path
from types import SimpleNamespace

import pytest
from harbor.models.agent.context import AgentContext

from harbor_dsh_evolution.session_agent import SessionObservationAgent
from harbor_dsh_evolution.session_batch import observation_digest


class FakeEnvironment:
    def __init__(self, digest: str):
        self.digest = digest
        self.calls = []

    async def exec(self, command, **kwargs):
        self.calls.append((command, kwargs))
        if command.startswith("test -r"):
            return SimpleNamespace(return_code=0, stdout="", stderr="")
        return SimpleNamespace(
            return_code=0,
            stdout=json.dumps({"status": "observed", "digest": self.digest}) + "\n",
            stderr="",
        )


@pytest.mark.asyncio
async def test_session_observation_agent_is_deterministic_and_model_free(tmp_path: Path):
    digest = "sha256:" + "a" * 64
    environment = FakeEnvironment(digest)
    agent = SessionObservationAgent(logs_dir=tmp_path)
    context = AgentContext()
    await agent.setup(environment)
    await agent.run("ignored model prompt", environment, context)
    assert agent.name() == "dsh-session-observation-adapter"
    assert agent.version() == "2.0.0"
    assert agent.model_name is None
    assert "hashlib" in environment.calls[1][0]
    assert "Session Observation digest mismatch" in environment.calls[1][0]
    assert context.metadata == {
        "execution_adapter": {
            "id": "dsh-session-observation-adapter",
            "version": "2.0.0",
            "execution_mode": "observe-existing",
            "model_invocation": False,
            "tool_reexecution": False,
        },
        "observation": {
            "digest": digest,
            "artifact": "/logs/artifacts/session-observation.json",
        },
    }


@pytest.mark.asyncio
async def test_session_observation_agent_executes_v2_digest_verification_with_js_number_forms(tmp_path: Path):
    source = tmp_path / "session-observation.json"
    artifact = tmp_path / "captured.json"
    observation = {
        "schema_version": 2,
        "protocol": "dsh-session-observation/v2",
        "record_kind": "dsh-session",
        "numeric_evidence": {"integral": 1.0, "negative_zero": -0.0, "small": 1e-7, "large": 1e21},
    }
    observation["digest"] = observation_digest(observation)
    source.write_text(json.dumps(observation))

    class LocalEnvironment:
        def resolve_environment_path(self, value: str):
            return source if value == SessionObservationAgent.OBSERVATION_PATH else artifact

        async def exec(self, command, **_kwargs):
            completed = subprocess.run(command, shell=True, text=True, capture_output=True, check=False)
            return SimpleNamespace(return_code=completed.returncode, stdout=completed.stdout, stderr=completed.stderr)

    context = AgentContext()
    await SessionObservationAgent(logs_dir=tmp_path).run("ignored", LocalEnvironment(), context)
    assert json.loads(artifact.read_text())["digest"] == observation["digest"]
    assert context.metadata["observation"]["digest"] == observation["digest"]


@pytest.mark.asyncio
async def test_session_observation_agent_fails_closed_when_record_is_missing(tmp_path: Path):
    class MissingEnvironment(FakeEnvironment):
        async def exec(self, command, **kwargs):
            return SimpleNamespace(return_code=1, stdout="", stderr="missing")

    with pytest.raises(RuntimeError, match="unavailable"):
        await SessionObservationAgent(logs_dir=tmp_path).setup(
            MissingEnvironment("sha256:" + "a" * 64)
        )
